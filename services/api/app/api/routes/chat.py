import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.response import ChatRouteResponse, ChatSuccessData, StandardApiResponse
from app.services.chat_memory_service import chat_memory_service
from app.services.llm_service import generate_chat_response
from app.services.rag_service import retrieve_relevant_context

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    session_id: str | None = None


def _extract_branch_values(context: str) -> list[dict[str, int]]:
    pairs = []
    for label in ("CSE", "IT", "ECE"):
        match = re.search(rf"{label}.*?(\d+)\s*LPA", context, flags=re.IGNORECASE)
        if match:
            pairs.append({"label": label, "value": int(match.group(1))})
    return pairs


@router.post("/chat")
async def chat(body: ChatRequest) -> ChatRouteResponse:
    try:
        prior_messages = (
            chat_memory_service.get_last_messages(body.session_id, limit=5)
            if body.session_id
            else []
        )
        session_id = chat_memory_service.append_message(body.session_id, "user", body.message)
        retrieval = retrieve_relevant_context(body.message)
        context = retrieval.get("context", "")
        retrieval_items = retrieval.get("items", [])
        lowered = body.message.lower()
        wants_chart = any(
            keyword in lowered
            for keyword in ("compare", "branch", "graph", "stats")
        )
        chart_values = _extract_branch_values(context if isinstance(context, str) else "")
        chart_data = (
            {
                "chart": {
                    "type": "bar",
                    "xKey": "label",
                    "yKey": "value",
                    "data": chart_values,
                }
            }
            if wants_chart and chart_values
            else None
        )

        result = generate_chat_response(body.message, context=context, history=prior_messages)
        reply_text = result["message"]
        session_id = chat_memory_service.append_message(session_id, "assistant", reply_text)
        citations = []
        for item in retrieval_items[:3]:
            meta = item.get("metadata", {})
            source = meta.get("source_file", "unknown")
            section = meta.get("section", "unknown")
            page = meta.get("page_number", 0)
            citations.append(f"{source} | {section} | page {page}")
        chart_payload = chart_data["chart"] if chart_data else None
        return ChatRouteResponse(
            success=True,
            data=ChatSuccessData(
                message=reply_text,
                session_id=session_id,
                citations=citations,
                chart=chart_payload,
            ),
            error=None,
        )
    except Exception as exc:
        return ChatRouteResponse(success=False, data=None, error=str(exc))


@router.get("/chat/history")
async def chat_history(session_id: str) -> StandardApiResponse:
    history = chat_memory_service.get_history(session_id)
    return StandardApiResponse(
        response="history",
        session_id=session_id,
        citations=[],
        data={"messages": history},
        error=None,
    )
