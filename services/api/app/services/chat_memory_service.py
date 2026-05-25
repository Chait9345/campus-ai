from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from uuid import uuid4


class ChatMemoryService:
    def __init__(self) -> None:
        self._lock = Lock()
        self._path = Path(__file__).resolve().parents[2] / "data" / "chat_memory.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _load(self) -> dict[str, dict]:
        if not self._path.exists():
            return {}
        try:
            raw = self._path.read_text(encoding="utf-8")
            data = json.loads(raw) if raw.strip() else {}
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save(self, data: dict[str, dict]) -> None:
        self._path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def append_message(self, session_id: str | None, role: str, content: str) -> str:
        sid = session_id or str(uuid4())
        with self._lock:
            db = self._load()
            session = db.get(sid, {"session_id": sid, "messages": []})
            messages = session.get("messages", [])
            messages.append({"role": role, "content": content})
            session["messages"] = messages
            db[sid] = session
            self._save(db)
        return sid

    def get_history(self, session_id: str) -> list[dict[str, str]]:
        with self._lock:
            db = self._load()
            session = db.get(session_id)
            if not session:
                return []
            messages = session.get("messages", [])
            return messages if isinstance(messages, list) else []

    def get_last_messages(self, session_id: str, limit: int = 3) -> list[dict[str, str]]:
        history = self.get_history(session_id)
        if limit <= 0:
            return []
        return history[-limit:]


chat_memory_service = ChatMemoryService()
