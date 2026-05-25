from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

import chromadb
import google.generativeai as genai
import pandas as pd
from pypdf import PdfReader

# Gemini embeddings use the same GEMINI_API_KEY as chat.
# Use embedding-001 which is stable and widely available
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "models/embedding-001")
TOP_K = 5
MIN_RELEVANCE = 0.55
MAX_CHUNK_TOKENS = 500
MIN_CHUNK_TOKENS = 300
CHROMA_COLLECTION = "campus_ai_gemini_embed"
CHROMA_PATH = Path(__file__).resolve().parents[2] / "data" / ".chroma"
_chroma_client: chromadb.PersistentClient | None = None
_collection: Any = None

DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _token_count(text: str) -> int:
    # Lightweight token approximation to avoid extra tokenizer dependencies.
    return max(1, int(len(text.split()) * 1.3))


def _semantic_chunk(text: str) -> list[str]:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        return []
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for sentence in sentences:
        s = sentence.strip()
        if not s:
            continue
        s_tokens = _token_count(s)
        if current and current_tokens + s_tokens > MAX_CHUNK_TOKENS:
            merged = " ".join(current).strip()
            if merged:
                chunks.append(merged)
            current = [s]
            current_tokens = s_tokens
            continue
        current.append(s)
        current_tokens += s_tokens
        if current_tokens >= MIN_CHUNK_TOKENS:
            merged = " ".join(current).strip()
            if merged:
                chunks.append(merged)
            current = []
            current_tokens = 0

    if current:
        merged = " ".join(current).strip()
        if merged:
            chunks.append(merged)
    return chunks


def _embed_texts(texts: list[str], *, task_type: str) -> list[list[float]]:
    """Vector embeddings via Gemini (uses GEMINI_API_KEY)."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY must be set for RAG embeddings (same key as chat)."
        )
    genai.configure(api_key=api_key)
    out: list[list[float]] = []
    for t in texts:
        text = (t or "").strip()
        if not text:
            raise ValueError("Cannot embed empty text")
        res = genai.embed_content(
            model=GEMINI_EMBED_MODEL,
            content=text,
            task_type=task_type,
        )
        emb = res.get("embedding")
        if not emb:
            raise RuntimeError("Gemini embed_content returned no embedding")
        out.append(list(emb))
    return out


def _read_text_file(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return [
        {
            "text": text,
            "metadata": {
                "source_file": path.name,
                "section": "full_text",
                "page_number": 0,
            },
        }
    ]


def _read_pdf_file(path: Path) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    reader = PdfReader(str(path))
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        pages.append(
            {
                "text": text,
                "metadata": {
                    "source_file": path.name,
                    "section": f"page_{i}",
                    "page_number": i,
                },
            }
        )
    return pages


def _read_tabular_file(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path)
    else:
        df = pd.read_excel(path)
    rows: list[dict[str, Any]] = []
    for idx, row in df.fillna("").iterrows():
        row_text = " | ".join(f"{col}: {row[col]}" for col in df.columns)
        rows.append(
            {
                "text": row_text,
                "metadata": {
                    "source_file": path.name,
                    "section": f"row_{idx + 1}",
                    "page_number": 0,
                },
            }
        )
    return rows


def _load_documents() -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    if not DATA_DIR.exists():
        return documents
    for path in DATA_DIR.iterdir():
        if not path.is_file():
            continue
        documents.extend(_read_any_supported_file(path))
    return documents


def _read_any_supported_file(path: Path) -> list[dict[str, Any]]:
    ext = path.suffix.lower()
    if ext == ".txt":
        return _read_text_file(path)
    if ext == ".pdf":
        return _read_pdf_file(path)
    if ext in {".csv", ".xlsx", ".xls"}:
        return _read_tabular_file(path)
    return []


def _ensure_collection() -> None:
    global _chroma_client, _collection
    if _collection is not None:
        return
    os.makedirs(CHROMA_PATH, exist_ok=True)
    _chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    _collection = _chroma_client.get_or_create_collection(name=CHROMA_COLLECTION)


def ingest_file_into_collection(path: Path) -> dict[str, Any]:
    """Read a single file, chunk, embed and upsert into the Chroma collection.

    Returns a small stats dict so callers can report progress.
    """

    _ensure_collection()
    if _collection is None:
        raise RuntimeError("Chroma collection is not initialised")

    records = _read_any_supported_file(path)
    ids: list[str] = []
    docs: list[str] = []
    metadatas: list[dict[str, Any]] = []
    embeds: list[list[float]] = []

    for record in records:
        for ci, chunk in enumerate(_semantic_chunk(record["text"])):
            source = record["metadata"]["source_file"]
            section = record["metadata"]["section"]
            page_number = int(record["metadata"]["page_number"])
            chunk_id = hashlib.md5(
                f"{source}:{section}:{ci}:{chunk[:60]}".encode("utf-8")
            ).hexdigest()
            ids.append(chunk_id)
            docs.append(chunk)
            metadatas.append(
                {
                    "source_file": source,
                    "section": section,
                    "page_number": page_number,
                }
            )
            embeds.append(_embed_texts([chunk], task_type="retrieval_document")[0])

    if ids:
        _collection.add(ids=ids, embeddings=embeds, documents=docs, metadatas=metadatas)
    return {"chunks": len(ids)}


def retrieve_relevant_context(query: str, top_k: int = TOP_K) -> dict[str, Any]:
    try:
        _ensure_collection()
        if not query.strip() or _collection is None or _collection.count() == 0:
            return {"context": "", "items": []}
        k = max(3, min(5, top_k))
        query_embedding = _embed_texts([query.strip()], task_type="retrieval_query")[0]
        raw = _collection.query(query_embeddings=[query_embedding], n_results=k)
        docs = (raw.get("documents") or [[]])[0]
        metas = (raw.get("metadatas") or [[]])[0]
        dists = (raw.get("distances") or [[]])[0]

        items: list[dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, dists):
            distance = float(dist or 0.0)
            relevance = 1.0 / (1.0 + distance)
            if relevance < MIN_RELEVANCE:
                continue
            safe_meta = meta or {}
            items.append(
                {
                    "text": doc or "",
                    "metadata": {
                        "source_file": safe_meta.get("source_file", "unknown"),
                        "section": safe_meta.get("section", "unknown"),
                        "page_number": int(safe_meta.get("page_number", 0) or 0),
                        "relevance": round(relevance, 4),
                    },
                }
            )

        context_text = "\n\n".join(item["text"] for item in items if item["text"].strip())
        return {"context": context_text, "items": items}
    except Exception as e:
        # If embedding fails, return empty context so chat still works
        print(f"RAG retrieval failed: {e}")
        return {"context": "", "items": []}


def _fallback_full_text_context() -> str:
    text_parts: list[str] = []
    for path in DATA_DIR.glob("*.txt"):
        text_parts.append(path.read_text(encoding="utf-8", errors="ignore"))
    return "\n\n".join(part.strip() for part in text_parts if part.strip())


def get_relevant_context(query: str) -> str:
    try:
        data = retrieve_relevant_context(query, top_k=TOP_K)
        context_text = data.get("context", "")
        if not context_text.strip():
            context_text = _fallback_full_text_context()
        print("QUERY:", query)
        print("CONTEXT LENGTH:", len(context_text))
        print("CONTEXT PREVIEW:", context_text[:200])
        return context_text
    except Exception:
        full_text = _fallback_full_text_context()
        print("QUERY:", query)
        print("CONTEXT LENGTH:", len(full_text))
        print("CONTEXT PREVIEW:", full_text[:200])
        if full_text:
            return full_text
        return ""
