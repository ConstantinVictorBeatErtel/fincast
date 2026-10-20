"""OpenRouter client with stable prompt prefixes and structured responses."""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from time import monotonic
from typing import Any

import httpx

from .cache import canonical_json
from .contracts import NodeContract
from .telemetry import RunTelemetry


Message = dict[str, Any]


def build_prompt(node: NodeContract, evidence_corpus: Any, variable_tail: str) -> list[Message]:
    """Assemble prompts in the cache-sensitive order required by OpenRouter."""

    static_system = (
        "You are a financial forecast engine research agent. Return only the declared DriverEstimate JSON object. "
        "Every numeric value must be a driver, never a computed total. Cite only evidence spans you actually used."
    )
    shared_evidence = "SHARED EVIDENCE\n" + (evidence_corpus if isinstance(evidence_corpus, str) else canonical_json(evidence_corpus))
    node_instruction = (
        f"NODE {node.id}\nEstimate driver {node.driver_name}. Output contract: "
        + canonical_json(node.output)
        + "\nRequired evidence sections: "
        + canonical_json(node.evidence_sections)
    )
    return [
        {"role": "system", "content": static_system},
        {"role": "user", "content": shared_evidence},
        {"role": "user", "content": node_instruction},
        {"role": "user", "content": variable_tail},
    ]


def prompt_prefix_hash(messages: Sequence[Message]) -> str:
    prefix = "".join(str(message.get("role", "")) + "\n" + str(message.get("content", "")) for message in messages[:2])
    return hashlib.sha256(prefix.encode("utf-8")).hexdigest()


@dataclass
class LLMResponse:
    text: str
    usage: dict[str, Any]
    raw: dict[str, Any]


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = "https://openrouter.ai/api/v1",
        timeout_seconds: float = 60.0,
        telemetry: RunTelemetry | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.telemetry = telemetry
        self._http_client = http_client

    async def complete(
        self,
        *,
        model: str,
        messages: list[Message],
        run_id: str,
        node_id: str,
        session_id: str | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for model-backed nodes")
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        if session_id:
            body["session_id"] = session_id
        if model.startswith(("anthropic/", "alibaba/")):
            # Explicit provider breakpoints are only used where the provider requires them.
            body["messages"] = [dict(message, cache_control={"type": "ephemeral"}) for message in messages[:2]] + messages[2:]
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://fincast.app",
            "X-Title": "Fincast Forecast Engine",
        }
        started_at = monotonic()
        owns_client = self._http_client is None
        client = self._http_client or httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_seconds)
        try:
            response = await client.post("/chat/completions", headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
        finally:
            if owns_client:
                await client.aclose()
        choices = payload.get("choices") or []
        if not choices:
            raise RuntimeError("OpenRouter response contained no choices")
        content = choices[0].get("message", {}).get("content", "")
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, Mapping))
        result = LLMResponse(text=str(content), usage=payload.get("usage") or {}, raw=payload)
        if self.telemetry:
            self.telemetry.record_response(run_id=run_id, node_id=node_id, model=model, started_at=started_at, response=result)
        return result

    async def complete_json(self, **kwargs: Any) -> dict[str, Any]:
        response = await self.complete(**kwargs)
        try:
            return json.loads(response.text)
        except json.JSONDecodeError as exc:
            raise ValueError("model returned non-JSON content") from exc

