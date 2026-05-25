"""Application configuration (extend when wiring RAG, DB, etc.)."""

import os

API_TITLE: str = os.getenv("API_TITLE", "CampusAI API")
