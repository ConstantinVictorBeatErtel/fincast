"""Result-level memoisation for research nodes."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any, Protocol


class ResultCache(Protocol):
    async def get(self, cache_key: str) -> Any | None: ...
    async def set(self, cache_key: str, value: Any) -> None: ...


class InMemoryResultCache:
    def __init__(self) -> None:
        self._values: dict[str, tuple[Any, datetime, int]] = {}

    async def get(self, cache_key: str) -> Any | None:
        item = self._values.get(cache_key)
        if item is None:
            return None
        value, created_at, hit_count = item
        self._values[cache_key] = (value, created_at, hit_count + 1)
        return value

    async def set(self, cache_key: str, value: Any) -> None:
        self._values[cache_key] = (value, datetime.now(timezone.utc), 0)

    @property
    def hit_count(self) -> int:
        return sum(item[2] for item in self._values.values())


def make_cache_key(
    ticker: str,
    driver: str,
    evidence_version: str,
    as_of_quarter: str,
    prompt_version: str,
) -> str:
    payload = "|".join((ticker, driver, evidence_version, as_of_quarter, prompt_version))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_json(value: Mapping[str, Any] | list[Any] | str) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

