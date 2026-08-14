from __future__ import annotations

import secrets
import time


class SessionTicketStore:
    """Short-lived, single-use WebSocket tickets bound to a run id."""

    def __init__(self, ttl_seconds: float = 30.0, now=time.monotonic):
        self._ttl = ttl_seconds
        self._now = now
        self._tickets: dict[str, tuple[str, float]] = {}

    def issue(self, run_id: str) -> dict:
        self._purge()
        ticket = secrets.token_urlsafe(24)
        expires_at = self._now() + self._ttl
        self._tickets[ticket] = (run_id, expires_at)
        return {"ticket": ticket, "expires_in": self._ttl}

    def consume(self, ticket: str, run_id: str) -> bool:
        self._purge()
        entry = self._tickets.pop(ticket, None)
        if entry is None:
            return False
        bound_run, expires_at = entry
        if expires_at < self._now():
            return False
        return bound_run == run_id

    def _purge(self) -> None:
        now = self._now()
        expired = [key for key, (_, expires) in self._tickets.items() if expires < now]
        for key in expired:
            self._tickets.pop(key, None)
