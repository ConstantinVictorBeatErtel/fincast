from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict

from ..contracts import Citation, DriverEstimate
from ..llm import OpenRouterClient


class GroundingVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supported: bool
    issue: str | None = None


class GroundingCritic(Protocol):
    async def check(self, estimate: DriverEstimate, evidence: list[Citation]) -> GroundingVerdict: ...


class PassThroughGroundingCritic:
    async def check(self, estimate: DriverEstimate, evidence: list[Citation]) -> GroundingVerdict:
        return GroundingVerdict(supported=True)


class LLMGroundingCritic:
    """Fresh-context critic that sees the claim and cited spans only."""

    def __init__(self, client: OpenRouterClient, *, model: str, run_id: str) -> None:
        self.client = client
        self.model = model
        self.run_id = run_id

    async def check(self, estimate: DriverEstimate, evidence: list[Citation]) -> GroundingVerdict:
        payload = await self.client.complete_json(
            model=self.model,
            run_id=self.run_id,
            node_id=f"grounding.{estimate.driver_name}",
            session_id=self.run_id,
            messages=[
                {"role": "system", "content": "Return only {supported: boolean, issue: string|null}. Never suggest a replacement number."},
                {"role": "user", "content": str({"claim": {"driver_name": estimate.driver_name, "value": estimate.value}, "cited_evidence": [item.model_dump() for item in evidence]})},
            ],
        )
        return GroundingVerdict.model_validate(payload)


async def check_grounding(critic: GroundingCritic, estimate: DriverEstimate) -> GroundingVerdict:
    return await critic.check(estimate, estimate.cited_evidence)
