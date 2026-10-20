from __future__ import annotations

from typing import Protocol, Any

from pydantic import BaseModel, ConfigDict, Field

from ..llm import OpenRouterClient


class PlausibilityVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verdict: str
    concerns: list[str] = Field(default_factory=list)


class PlausibilityCritic(Protocol):
    async def check(self, forecast: dict[str, Any], valuation: dict[str, Any]) -> PlausibilityVerdict: ...


class PassThroughPlausibilityCritic:
    async def check(self, forecast: dict[str, Any], valuation: dict[str, Any]) -> PlausibilityVerdict:
        return PlausibilityVerdict(verdict="pass")


class LLMPlausibilityCritic:
    def __init__(self, client: OpenRouterClient, *, model: str, run_id: str) -> None:
        self.client = client
        self.model = model
        self.run_id = run_id

    async def check(self, forecast: dict[str, Any], valuation: dict[str, Any]) -> PlausibilityVerdict:
        payload = await self.client.complete_json(
            model=self.model,
            run_id=self.run_id,
            node_id="plausibility",
            session_id=self.run_id,
            messages=[
                {"role": "system", "content": "Return only {verdict: 'pass'|'flag', concerns: [string]}. This is advisory and must not emit numbers."},
                {"role": "user", "content": str({"forecast": forecast, "valuation": valuation})},
            ],
        )
        return PlausibilityVerdict.model_validate(payload)
