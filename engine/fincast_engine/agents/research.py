from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ..contracts import DriverEstimate, NodeContract
from ..llm import OpenRouterClient, build_prompt


class ResearchAgent:
    """Resolve one node and enforce the Pydantic output contract."""

    def __init__(
        self,
        client: OpenRouterClient,
        *,
        model: str,
        evidence_corpus: Any,
        run_id: str,
        ticker: str,
        prior: float | list[float],
        prompt_version: str = "v1",
    ) -> None:
        self.client = client
        self.model = model
        self.evidence_corpus = evidence_corpus
        self.run_id = run_id
        self.ticker = ticker
        self.prior = prior
        self.prompt_version = prompt_version

    async def __call__(self, contract: NodeContract, retry_feedback: str = "") -> DriverEstimate:
        variable_tail = (
            f"ticker={self.ticker}\nprior={self.prior}\n"
            f"prompt_version={self.prompt_version}\nretry_feedback={retry_feedback or 'none'}"
        )
        payload = await self.client.complete_json(
            model=self.model,
            messages=build_prompt(contract, self.evidence_corpus, variable_tail),
            run_id=self.run_id,
            node_id=contract.id,
            session_id=self.run_id,
        )
        return DriverEstimate.model_validate(payload)

