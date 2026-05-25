from app.api.routes.chat import router as chat_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.interview import router as interview_router

__all__ = ["health_router", "interview_router", "chat_router", "documents_router"]
