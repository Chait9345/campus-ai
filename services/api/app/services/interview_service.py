"""
Interview simulator — mock logic and session storage.

Supports evaluate-only + /interview/next advance flow, retry (evaluate-only),
and LLM final report on completion.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from app.services.llm_service import evaluate_interview_answer, generate_interview_final_report

logger = logging.getLogger(__name__)

_API_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_PATH = _API_ROOT / "data" / "interview_mock.json"

MAX_QUESTIONS_PER_SESSION = 5


class FeedbackProvider(Protocol):
    def feedback_and_score(
        self,
        *,
        company_id: str,
        question: str,
        answer: str,
        difficulty: str = "medium",
    ) -> tuple[str, int]: ...


class MockFeedbackProvider:
    def __init__(self, templates: list[str]) -> None:
        self._templates = templates or ["Consider adding more specific examples."]

    def feedback_and_score(
        self,
        *,
        company_id: str,
        question: str,
        answer: str,
        difficulty: str = "medium",
    ) -> tuple[str, int]:
        _ = difficulty
        text = answer.strip()
        salt = sum(ord(c) for c in company_id)
        idx = (len(text) + len(question) + salt) % len(self._templates)
        fb = self._templates[idx]
        if len(text) < 20:
            score = 4
        elif len(text) < 80:
            score = 6
        elif len(text) < 200:
            score = 8
        else:
            score = 9
        return fb, score


class LLMFeedbackProvider:
    def __init__(self, fallback: MockFeedbackProvider) -> None:
        self._fallback = fallback

    def feedback_and_score(
        self,
        *,
        company_id: str,
        question: str,
        answer: str,
        difficulty: str = "medium",
    ) -> tuple[str, int]:
        try:
            ev = evaluate_interview_answer(
                question, answer, company_id=company_id, difficulty=difficulty
            )
            fb = ev.feedback.strip()
            ideal = ev.ideal_answer.strip()
            if ideal:
                fb = f"{fb}\n\nIdeal answer outline: {ideal}"
            return fb, ev.score
        except Exception as exc:
            logger.warning(
                "LLM interview evaluation failed; using mock feedback: %s",
                exc,
            )
            return self._fallback.feedback_and_score(
                company_id=company_id,
                question=question,
                answer=answer,
                difficulty=difficulty,
            )


def _iso_utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _normalize_question_items(raw_list: list[Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in raw_list:
        if isinstance(item, str):
            out.append({"text": item.strip(), "type": "HR", "difficulty": "medium"})
        elif isinstance(item, dict):
            t = str(item.get("text", "")).strip()
            if not t:
                continue
            out.append(
                {
                    "text": t,
                    "type": str(item.get("type", "HR")).strip() or "HR",
                    "difficulty": str(item.get("difficulty", "medium")).strip()
                    or "medium",
                }
            )
    return out


def _mock_final_report(scores: list[int]) -> dict[str, Any]:
    avg = sum(scores) / max(len(scores), 1)
    fs = max(1, min(10, int(round(avg))))
    return {
        "final_score": fs,
        "strengths": ["Clear communication", "Structured responses"],
        "weaknesses": ["Add more measurable outcomes", "Deepen technical specifics"],
        "suggestions": ["Practice one timed DSA round", "Record and review one answer"],
    }


@dataclass
class _Session:
    company_id: str
    company_label: str
    questions: list[str]
    question_types: list[str]
    difficulties: list[str]
    answered_count: int = 0
    question_sent_at: float = 0.0
    pending_advance: bool = False
    staged_answer: str | None = None
    staged_score: int | None = None
    staged_feedback: str | None = None
    attempts: list[list[str]] = field(default_factory=list)
    committed_answers: list[str | None] = field(default_factory=list)
    committed_scores: list[int | None] = field(default_factory=list)


@dataclass
class AnswerResult:
    feedback: str
    score: int
    next_question: str | None
    completed: bool
    time_taken_seconds: float
    final_summary: str | None
    next_question_sent_at_iso: str | None
    question_type: str = "HR"
    next_question_type: str | None = None
    awaiting_next: bool = False
    final_report: dict[str, Any] | None = None


class InterviewService:
    def __init__(
        self,
        *,
        data_path: Path | None = None,
        feedback_provider: FeedbackProvider | None = None,
        max_questions: int = MAX_QUESTIONS_PER_SESSION,
    ) -> None:
        path = data_path or _DEFAULT_DATA_PATH
        raw = json.loads(path.read_text(encoding="utf-8"))
        self._companies: list[dict[str, Any]] = raw["companies"]
        self._questions_by_company: dict[str, list[Any]] = raw["questions_by_company"]
        templates = raw.get("mock_feedback_templates", [])
        mock = MockFeedbackProvider(templates)
        self._feedback = feedback_provider or LLMFeedbackProvider(mock)
        self._sessions: dict[str, _Session] = {}
        self._max_questions = max(1, min(max_questions, MAX_QUESTIONS_PER_SESSION))

    @property
    def max_questions_per_session(self) -> int:
        return self._max_questions

    def _resolve_company_key(self, company: str) -> tuple[str, str]:
        c = company.strip()
        lower = c.lower()
        for co in self._companies:
            name = co["name"]
            if name.lower() == lower:
                return co["id"], name
            for a in co.get("aliases", []):
                if a.lower() == lower:
                    return co["id"], name
        for co in self._companies:
            name = co["name"]
            if name.lower() in lower or lower in name.lower():
                return co["id"], name
        return "_default", c.strip() or "Unknown company"

    def _items_for(self, company_id: str) -> list[dict[str, str]]:
        qmap = self._questions_by_company
        raw = (
            qmap[company_id]
            if company_id in qmap and company_id != "_default"
            else qmap.get("_default", [])
        )
        return _normalize_question_items(list(raw))

    def start(self, company: str) -> tuple[str, str, str, int, str]:
        """Returns first_question, session_id, sent_iso, total, first_question_type."""
        cid, label = self._resolve_company_key(company)
        items = self._items_for(cid)
        if not items:
            items = _normalize_question_items(list(self._questions_by_company["_default"]))
        items = items[: self._max_questions]
        n = len(items)
        questions = [x["text"] for x in items]
        types = [x["type"] for x in items]
        diffs = [x["difficulty"] for x in items]
        sid = str(uuid.uuid4())
        now = time.time()
        self._sessions[sid] = _Session(
            company_id=cid,
            company_label=label,
            questions=questions,
            question_types=types,
            difficulties=diffs,
            answered_count=0,
            question_sent_at=now,
            attempts=[[] for _ in range(n)],
            committed_answers=[None] * n,
            committed_scores=[None] * n,
        )
        return questions[0], sid, _iso_utc(now), n, types[0]

    def _build_final_report_llm(self, session: _Session) -> dict[str, Any]:
        blocks: list[dict[str, Any]] = []
        for i, q in enumerate(session.questions):
            ans = session.committed_answers[i]
            sc = session.committed_scores[i]
            qt = session.question_types[i] if i < len(session.question_types) else "HR"
            if ans is None or sc is None:
                continue
            blocks.append(
                {
                    "question": q,
                    "type": qt,
                    "answer": ans,
                    "score": sc,
                    "attempts": session.attempts[i] if i < len(session.attempts) else [],
                }
            )
        try:
            rep = generate_interview_final_report(
                company_label=session.company_label,
                qa_blocks=blocks,
            )
            return rep.model_dump()
        except Exception as exc:
            logger.warning("Final report LLM failed; using mock: %s", exc)
            scores = [s for s in session.committed_scores if s is not None]
            return _mock_final_report([int(x) for x in scores])

    def _finalize_if_complete(self, session: _Session) -> tuple[bool, str | None, dict[str, Any] | None]:
        if session.answered_count < len(session.questions):
            return False, None, None
        summary = (
            f"You have completed {len(session.questions)} practice question(s) for "
            f"{session.company_label}. See the report below."
        )
        report = self._build_final_report_llm(session)
        return True, summary, report

    def answer(self, session_id: str, answer: str, *, advance: bool = True) -> AnswerResult:
        session = self._sessions.get(session_id)
        if session is None:
            raise KeyError("unknown_session")

        idx = session.answered_count
        if idx >= len(session.questions):
            raise ValueError("session_already_complete")

        if session.pending_advance and advance:
            raise ValueError("pending_next_required")

        sent_at = session.question_sent_at
        now = time.time()
        time_taken = max(0.0, now - sent_at)

        q = session.questions[idx]
        qtype = session.question_types[idx] if idx < len(session.question_types) else "HR"
        diff = session.difficulties[idx] if idx < len(session.difficulties) else "medium"

        feedback, score = self._feedback.feedback_and_score(
            company_id=session.company_id,
            question=q,
            answer=answer,
            difficulty=diff,
        )

        if idx < len(session.attempts):
            session.attempts[idx].append(answer.strip())

        if not advance:
            session.pending_advance = True
            session.staged_answer = answer.strip()
            session.staged_score = score
            session.staged_feedback = feedback
            nxt_type = qtype
            return AnswerResult(
                feedback=feedback,
                score=score,
                next_question=q,
                completed=False,
                time_taken_seconds=round(time_taken, 3),
                final_summary=None,
                next_question_sent_at_iso=_iso_utc(now),
                question_type=qtype,
                next_question_type=nxt_type,
                awaiting_next=True,
                final_report=None,
            )

        session.committed_answers[idx] = answer.strip()
        session.committed_scores[idx] = score
        session.answered_count = idx + 1

        done, summary, report = self._finalize_if_complete(session)
        if done:
            return AnswerResult(
                feedback=feedback,
                score=score,
                next_question=None,
                completed=True,
                time_taken_seconds=round(time_taken, 3),
                final_summary=summary,
                next_question_sent_at_iso=None,
                question_type=qtype,
                next_question_type=None,
                awaiting_next=False,
                final_report=report,
            )

        session.question_sent_at = now
        session.pending_advance = False
        nq = session.questions[session.answered_count]
        nt = (
            session.question_types[session.answered_count]
            if session.answered_count < len(session.question_types)
            else "HR"
        )
        return AnswerResult(
            feedback=feedback,
            score=score,
            next_question=nq,
            completed=False,
            time_taken_seconds=round(time_taken, 3),
            final_summary=None,
            next_question_sent_at_iso=_iso_utc(now),
            question_type=qtype,
            next_question_type=nt,
            awaiting_next=False,
            final_report=None,
        )

    def advance(self, session_id: str) -> AnswerResult:
        """Commit staged evaluate-only step and move to the next question (or complete)."""
        session = self._sessions.get(session_id)
        if session is None:
            raise KeyError("unknown_session")

        if not session.pending_advance:
            raise ValueError("nothing_to_advance")

        idx = session.answered_count
        if session.staged_answer is None or session.staged_score is None:
            raise ValueError("invalid_staged_state")

        feedback = session.staged_feedback or ""
        score = session.staged_score
        time_taken = 0.0
        qtype = session.question_types[idx] if idx < len(session.question_types) else "HR"

        session.committed_answers[idx] = session.staged_answer
        session.committed_scores[idx] = score
        session.pending_advance = False
        session.staged_answer = None
        session.staged_score = None
        session.staged_feedback = None

        now = time.time()
        session.answered_count = idx + 1

        done, summary, report = self._finalize_if_complete(session)
        if done:
            return AnswerResult(
                feedback=feedback,
                score=score,
                next_question=None,
                completed=True,
                time_taken_seconds=round(time_taken, 3),
                final_summary=summary,
                next_question_sent_at_iso=None,
                question_type=qtype,
                next_question_type=None,
                awaiting_next=False,
                final_report=report,
            )

        session.question_sent_at = now
        nq = session.questions[session.answered_count]
        nt = (
            session.question_types[session.answered_count]
            if session.answered_count < len(session.question_types)
            else "HR"
        )
        return AnswerResult(
            feedback=feedback,
            score=score,
            next_question=nq,
            completed=False,
            time_taken_seconds=round(time_taken, 3),
            final_summary=None,
            next_question_sent_at_iso=_iso_utc(now),
            question_type=qtype,
            next_question_type=nt,
            awaiting_next=False,
            final_report=None,
        )


interview_service = InterviewService()
