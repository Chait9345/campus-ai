from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.rag_service import DATA_DIR, ingest_file_into_collection

router = APIRouter(tags=["documents"], prefix="/documents")


ALLOWED_EXTENSIONS = {".txt", ".pdf", ".csv", ".xlsx", ".xls"}


@router.post("/upload")
async def upload_document(file: Annotated[UploadFile, File(...)]):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target_path = DATA_DIR / (file.filename or "uploaded_file")

    content = await file.read()
    target_path.write_bytes(content)

    try:
        stats = ingest_file_into_collection(target_path)
        return {
            "success": True,
            "file": target_path.name,
            "chunks_indexed": stats.get("chunks", 0),
        }
    except Exception as exc:
        return {
            "success": True,
            "file": target_path.name,
            "chunks_indexed": 0,
            "warning": f"File uploaded but indexing failed: {str(exc)}",
        }
