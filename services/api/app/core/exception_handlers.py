import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.models.response import StandardApiResponse

logger = logging.getLogger(__name__)


def _as_json_body(model: StandardApiResponse) -> dict[str, Any]:
    return model.model_dump()


def _detail_to_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    return str(jsonable_encoder(detail))


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        body = StandardApiResponse(
            response="",
            citations=[],
            session_id="",
            error=_detail_to_message(exc.detail),
            data=None,
        )
        return JSONResponse(status_code=exc.status_code, content=_as_json_body(body))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        body = StandardApiResponse(
            response="",
            citations=[],
            session_id="",
            error="Invalid request: " + _detail_to_message(exc.errors()),
            data=None,
        )
        return JSONResponse(status_code=422, content=_as_json_body(body))

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error")
        body = StandardApiResponse(
            response="",
            citations=[],
            session_id="",
            error="Please try again.",
            data=None,
        )
        return JSONResponse(status_code=500, content=_as_json_body(body))
