from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv  # ✅ ADD THIS

from app.api.routes.chat import router as chat_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.interview import router as interview_router
from app.core.config import API_TITLE
from app.core.exception_handlers import register_exception_handlers

# ✅ LOAD ENV VARIABLES (VERY IMPORTANT)
load_dotenv()

app = FastAPI(title=API_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(health_router)
app.include_router(interview_router)
app.include_router(chat_router)