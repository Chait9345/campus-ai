"""Pydantic models shared across API responses."""

from typing import Any

from pydantic import BaseModel, Field


class ChatSuccessData(BaseModel):
    """Payload for POST /chat when success is true."""

    message: str
    session_id: str | None = None
    citations: list[str] = Field(default_factory=list)
    chart: dict[str, Any] | None = None


class ChatRouteResponse(BaseModel):
    """Envelope for POST /chat — stable contract for the web client."""

    success: bool
    data: ChatSuccessData | None = None
    error: str | None = None


class StandardApiResponse(BaseModel):
    """Envelope for every JSON API response."""

    response: str
    citations: list[str] = Field(default_factory=list)
    session_id: str | None = None
    error: str | None = None
    # Feature-specific payloads (e.g. interview feedback/score) without breaking the core shape.
    data: dict[str, Any] | None = None
