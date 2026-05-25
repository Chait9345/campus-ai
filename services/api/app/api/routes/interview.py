from fastapi import APIRouter, HTTPException

from app.models.interview import (
    InterviewAnswerRequest,
    InterviewNextRequest,
    InterviewStartRequest,
)
from app.models.response import StandardApiResponse
from app.services.interview_service import interview_service

router = APIRouter(prefix="/interview", tags=["interview"])


def _result_data(result) -> dict:
    d: dict = {
        "feedback": result.feedback,
        "score": result.score,
        "next_question": result.next_question,
        "completed": result.completed,
        "time_taken_seconds": result.time_taken_seconds,
        "question_sent_at": result.next_question_sent_at_iso,
        "question_type": result.question_type,
        "next_question_type": result.next_question_type,
        "awaiting_next": result.awaiting_next,
    }
    if result.final_report is not None:
        d["final_report"] = result.final_report
    return d


@router.post("/start")
async def interview_start(body: InterviewStartRequest) -> StandardApiResponse:
    question, session_id, sent_iso, total_planned, qtype = interview_service.start(
        body.company
    )
    return StandardApiResponse(
        response=question,
        citations=[],
        session_id=session_id,
        error=None,
        data={
            "question": question,
            "company": body.company.strip(),
            "question_sent_at": sent_iso,
            "total_questions": total_planned,
            "max_questions_per_session": interview_service.max_questions_per_session,
            "question_type": qtype,
        },
    )


@router.post("/answer")
async def interview_answer(body: InterviewAnswerRequest) -> StandardApiResponse:
    try:
        result = interview_service.answer(
            body.session_id, body.answer, advance=body.advance
        )
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired session",
        )
    except ValueError as e:
        msg = str(e)
        if msg == "session_already_complete":
            raise HTTPException(
                status_code=400,
                detail="This interview session is already complete.",
            )
        if msg == "pending_next_required":
            raise HTTPException(
                status_code=400,
                detail="Finish the pending step: call POST /interview/next, or use advance=false to retry.",
            )
        raise HTTPException(status_code=400, detail=msg)

    if result.completed:
        return StandardApiResponse(
            response=result.final_summary or "",
            citations=[],
            session_id=body.session_id,
            error=None,
            data=_result_data(result),
        )

    return StandardApiResponse(
        response=result.next_question or "",
        citations=[],
        session_id=body.session_id,
        error=None,
        data=_result_data(result),
    )


@router.post("/next")
async def interview_next(body: InterviewNextRequest) -> StandardApiResponse:
    try:
        result = interview_service.advance(body.session_id)
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired session",
        )
    except ValueError as e:
        msg = str(e)
        if msg == "nothing_to_advance":
            raise HTTPException(
                status_code=400,
                detail="Nothing to advance — submit an answer with advance=false first.",
            )
        if msg == "invalid_staged_state":
            raise HTTPException(status_code=400, detail="Invalid session state.")
        raise HTTPException(status_code=400, detail=msg)

    if result.completed:
        return StandardApiResponse(
            response=result.final_summary or "",
            citations=[],
            session_id=body.session_id,
            error=None,
            data=_result_data(result),
        )

    return StandardApiResponse(
        response=result.next_question or "",
        citations=[],
        session_id=body.session_id,
        error=None,
        data=_result_data(result),
    )
