"""
LLM helpers powered by Google Gemini.

Sync API is used by `InterviewService` and chat routes. Async wrappers are
kept for compatibility with existing call sites.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any, Literal

import google.generativeai as genai
from pydantic import BaseModel, Field

MODEL_NAME = "models/gemini-flash-latest"

QuestionDifficulty = Literal["easy", "medium", "hard"]


class InterviewEvaluation(BaseModel):
    score: int = Field(..., ge=1, le=10)
    feedback: str = Field(..., min_length=1)
    ideal_answer: str = Field(..., min_length=1)


SYSTEM_PROMPT = """You are an experienced technical interviewer for software and engineering roles.
Evaluate ONE candidate answer to ONE interview question.

Output rules (strict):
- Be concise. Avoid long explanations.
- feedback: at most 3-4 short lines of plain text (no bullets in feedback). No markdown.
- ideal_answer: bullet points only - each line starts with "- " (dash space). 3-6 bullets max. No paragraphs.
- Respond with JSON ONLY, no markdown fences, matching exactly:
  {"score": <integer 1-10>, "feedback": "<string>", "ideal_answer": "<string>"}
"""

FINAL_REPORT_SYSTEM = """You summarize a mock technical interview session for a candidate.
Return JSON ONLY with keys: final_score (integer 1-10), strengths (array of short strings), weaknesses (array), suggestions (array).
Be concise: at most 3 items per array, each item one short line.
final_score should reflect overall performance across all answers.
"""

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "campus_data.txt"


def _get_model(system_instruction: str | None = None):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(MODEL_NAME, system_instruction=system_instruction)


# Campus intent: whole-word / plural-safe match (avoids e.g. "mit" in "submit", "company" in "accompany").
_CAMPUS_QUERY_PATTERN = re.compile(
    r"\b(?:placements?|packages?|salary|salaries|compan(?:y|ies)|interview(?:s|ing|ed)?|mit|manipal)\b",
    re.IGNORECASE,
)


def is_relevant(query: str, context: str | None = None) -> bool:
    """True only if the query matches campus-related keywords (none → general path only)."""
    _ = context  # reserved for future retrieval-quality checks; routing uses query keywords only.
    return bool(_CAMPUS_QUERY_PATTERN.search(query or ""))


def _extract_json_block(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return stripped[start : end + 1]
    return stripped


def _normalize_difficulty(raw: str) -> QuestionDifficulty:
    x = (raw or "medium").strip().lower()
    if x in ("easy", "medium", "hard"):
        return x  # type: ignore[return-value]
    return "medium"


def _difficulty_scoring_hint(d: QuestionDifficulty) -> str:
    if d == "easy":
        return "Difficulty: EASY - prioritize strict correctness and clear structure."
    if d == "hard":
        return "Difficulty: HARD - reward strong partial credit and thoughtful reasoning."
    return "Difficulty: MEDIUM - balanced expectations for completeness and clarity."


def _user_content(
    *,
    company_id: str,
    question: str,
    answer: str,
    difficulty: QuestionDifficulty,
) -> str:
    return (
        f"{_difficulty_scoring_hint(difficulty)}\n\n"
        f"Company / role context id: {company_id}\n\n"
        f"Interview question:\n{question}\n\n"
        f"Candidate answer:\n{answer.strip()}"
    )


def _coerce_int_score(v: object) -> int:
    if isinstance(v, bool):
        raise ValueError("score must be an integer between 1 and 10")
    if isinstance(v, int):
        s = v
    elif isinstance(v, float):
        if abs(v - round(v)) > 1e-9:
            raise ValueError("score must be an integer between 1 and 10")
        s = int(round(v))
    else:
        raise ValueError("score must be an integer between 1 and 10")
    if s < 1 or s > 10:
        raise ValueError("score must be between 1 and 10 inclusive")
    return s


def _parse_and_validate_evaluation(content: str) -> InterviewEvaluation:
    raw = json.loads(_extract_json_block(content))
    if not isinstance(raw, dict):
        raise ValueError("LLM JSON root must be an object")

    score = _coerce_int_score(raw.get("score"))
    feedback = raw.get("feedback")
    if not isinstance(feedback, str) or not feedback.strip():
        raise ValueError("feedback must be a non-empty string")

    ideal = raw.get("ideal_answer")
    if not isinstance(ideal, str) or not ideal.strip():
        raise ValueError("ideal_answer must be a non-empty string")

    return InterviewEvaluation(
        score=score,
        feedback=feedback.strip(),
        ideal_answer=ideal.strip(),
    )


def _clean_report_lines(label: str, v: object) -> list[str]:
    if not isinstance(v, list):
        raise ValueError(f"{label} must be an array of strings")
    out = [str(x).strip()[:400] for x in v if str(x).strip()]
    if not out:
        raise ValueError(f"{label} must contain at least one non-empty string")
    return out[:6]


class InterviewFinalReport(BaseModel):
    final_score: int = Field(..., ge=1, le=10)
    strengths: list[str]
    weaknesses: list[str]
    suggestions: list[str]


def _parse_final_report(content: str) -> InterviewFinalReport:
    raw = json.loads(_extract_json_block(content))
    if not isinstance(raw, dict):
        raise ValueError("final report JSON root must be an object")
    return InterviewFinalReport(
        final_score=_coerce_int_score(raw.get("final_score")),
        strengths=_clean_report_lines("strengths", raw.get("strengths")),
        weaknesses=_clean_report_lines("weaknesses", raw.get("weaknesses")),
        suggestions=_clean_report_lines("suggestions", raw.get("suggestions")),
    )


def evaluate_interview_answer(
    question: str,
    answer: str,
    *,
    company_id: str,
    difficulty: str = "medium",
) -> InterviewEvaluation:
    d = _normalize_difficulty(difficulty)
    model = _get_model(SYSTEM_PROMPT)
    prompt = _user_content(
        company_id=company_id,
        question=question,
        answer=answer,
        difficulty=d,
    )
    resp = model.generate_content(prompt)
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Empty LLM response")
    return _parse_and_validate_evaluation(text)


async def evaluate_interview_answer_async(
    question: str,
    answer: str,
    *,
    company_id: str,
    difficulty: str = "medium",
) -> InterviewEvaluation:
    return await asyncio.to_thread(
        evaluate_interview_answer,
        question,
        answer,
        company_id=company_id,
        difficulty=difficulty,
    )


def generate_interview_final_report(
    *,
    company_label: str,
    qa_blocks: list[dict[str, Any]],
) -> InterviewFinalReport:
    model = _get_model(FINAL_REPORT_SYSTEM)
    payload = json.dumps(qa_blocks, ensure_ascii=False)
    prompt = (
        f"Company context: {company_label}\n\n"
        f"Session Q&A (JSON):\n{payload}\n\n"
        "Produce the summary JSON per system rules."
    )
    resp = model.generate_content(prompt)
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Empty LLM final report")
    return _parse_final_report(text)


_RAG_SYSTEM = """Answer ONLY from the provided context.
If answer not found, say exactly:
'Data not available in campus records.'
Do not use outside knowledge. Do not blend general knowledge with the context."""


def _normalize_rag_message(text: str) -> str:
    """Map model paraphrases of 'not found' to the canonical campus line."""
    t = (text or "").strip()
    if not t:
        return "Data not available in campus records."
    low = t.lower()
    if "data not available in campus records" in low:
        return "Data not available in campus records."
    if "not available" in low and "campus" in low and "record" in low:
        return "Data not available in campus records."
    return t


def generate_chat_response(
    message: str,
    context: list[str] | str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, str]:
    try:
        _ = history  # chat route still passes history; general answers must not use it (spec).

        query = (message or "").strip()
        if not query:
            return {"message": "Please share your question and I can help."}

        context_text = (context if isinstance(context, str) else "\n".join(context or [])).strip()
        context_exists = bool(context_text)

        print("QUERY:", query)
        print("MODEL:", MODEL_NAME)

        if context_exists and is_relevant(query, context_text):
            model = _get_model(_RAG_SYSTEM)
            user_prompt = f"Provided context:\n{context_text}\n\nQuestion:\n{query}"
            response = model.generate_content(user_prompt)
            text = (response.text or "").strip()
            print("RESPONSE:", text)
            if not text:
                raise RuntimeError("Empty Gemini response")
            return {"message": _normalize_rag_message(text)}

        model = _get_model(None)
        response = model.generate_content(query)
        text = (response.text or "").strip()
        print("RESPONSE:", text)
        if not text:
            raise RuntimeError("Empty Gemini response")
        return {"message": text}
    except Exception as e:
        raise Exception(f"Gemini error: {str(e)}") from e
