from fastapi import APIRouter

from app.models.response import StandardApiResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> StandardApiResponse:
    return StandardApiResponse(
        response="ok",
        citations=[],
        session_id="",
        error=None,
    )
