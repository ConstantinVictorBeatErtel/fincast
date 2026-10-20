from __future__ import annotations

from typing import Any

from ..contracts import DiscoveryResult
from ..llm import OpenRouterClient, build_prompt


class DriverDiscoveryAgent:
    def __init__(self, client: OpenRouterClient, model: str = "google/gemini-2.5-flash-lite") -> None:
        self.client = client
        self.model = model

    async def discover(self, *, run_id: str, evidence_corpus: Any, candidate_nodes: list[str]) -> DiscoveryResult:
        payload = {
            "role": "system",
            "content": "Select only independently observable financial driver node IDs. Never select totals or valuation outputs.",
        }
        messages = [payload, {"role": "user", "content": str(evidence_corpus)}, {"role": "user", "content": str(candidate_nodes)}]
        data = await self.client.complete_json(
            model=self.model,
            messages=messages,
            run_id=run_id,
            node_id="discovery",
            session_id=run_id,
        )
        return DiscoveryResult.model_validate(data)

