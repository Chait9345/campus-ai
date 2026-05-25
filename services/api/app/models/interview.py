"""Request bodies for interview simulator routes."""

from pydantic import BaseModel, Field


class InterviewStartRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=200)


class InterviewAnswerRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1, max_length=50_000)
    # True (default): evaluate and advance in one step (backward compatible).
    # False: evaluate only — call POST /interview/next to commit and move on (retry / evaluate-only).
    advance: bool = True


class InterviewNextRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
