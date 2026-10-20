from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from ..llm import OpenRouterClient


class Contradiction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_ids: list[str] = Field(default_factory=list)
    issue: str


class CoherenceVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contradictions: list[Contradiction] = Field(default_factory=list)


class CoherenceCritic(Protocol):
    async def check(self, driver_set: dict[str, float | list[float]]) -> CoherenceVerdict: ...


class PassThroughCoherenceCritic:
    async def check(self, driver_set: dict[str, float | list[float]]) -> CoherenceVerdict:
        return CoherenceVerdict()


class LLMCoherenceCritic:
    def __init__(self, client: OpenRouterClient, *, model: str, run_id: str) -> None:
        self.client = client
        self.model = model
        self.run_id = run_id

    async def check(self, driver_set: dict[str, float | list[float]]) -> CoherenceVerdict:
        payload = await self.client.complete_json(
            model=self.model,
            run_id=self.run_id,
            node_id="coherence",
            session_id=self.run_id,
            messages=[
                {"role": "system", "content": "Return only {contradictions: [{node_ids: [string], issue: string}]}. Never return replacement numbers."},
                {"role": "user", "content": str(driver_set)},
            ],
        )
        return CoherenceVerdict.model_validate(payload)
