"""Per-call cost accounting and run budget guard."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic
from typing import Any


class BudgetExceeded(RuntimeError):
    pass


@dataclass
class LLMCall:
    run_id: str
    node_id: str
    model: str
    prompt_tokens: int = 0
    cached_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0


@dataclass
class RunTelemetry:
    run_id: str
    max_cost_usd: float = 0.25
    calls: list[LLMCall] = field(default_factory=list)
    started_at: float = field(default_factory=monotonic)

    def reserve(self, projected_cost_usd: float) -> None:
        if self.total_cost_usd + projected_cost_usd > self.max_cost_usd:
            raise BudgetExceeded(
                f"projected cost ${self.total_cost_usd + projected_cost_usd:.4f} exceeds "
                f"MAX_COST_PER_RUN_USD=${self.max_cost_usd:.4f}"
            )

    def record(self, call: LLMCall) -> None:
        self.reserve(call.cost_usd)
        self.calls.append(call)

    @property
    def total_cost_usd(self) -> float:
        return sum(call.cost_usd for call in self.calls)

    @property
    def cache_hit_rate(self) -> float:
        prompt_tokens = sum(call.prompt_tokens for call in self.calls)
        return sum(call.cached_tokens for call in self.calls) / prompt_tokens if prompt_tokens else 0.0

    @property
    def retry_distribution(self) -> dict[int, int]:
        distribution: dict[int, int] = {}
        for call in self.calls:
            retries = int(getattr(call, "retry_count", 0))
            distribution[retries] = distribution.get(retries, 0) + 1
        return distribution

    def assert_cache_warm(self, *, dev_mode: bool = False, minimum_hit_rate: float = 0.5) -> None:
        """Fail loudly in development when the shared prefix is not being read."""

        if dev_mode and self.calls and self.cache_hit_rate < minimum_hit_rate:
            raise RuntimeError(
                f"OpenRouter cache hit rate {self.cache_hit_rate:.2%} is below {minimum_hit_rate:.2%}; "
                "the shared prompt prefix is unstable or the provider cache is cold"
            )

    def record_response(self, *, run_id: str, node_id: str, model: str, started_at: float, response: Any) -> LLMCall:
        usage = getattr(response, "usage", None) or {}
        if hasattr(usage, "model_dump"):
            usage = usage.model_dump()
        call = LLMCall(
            run_id=run_id,
            node_id=node_id,
            model=model,
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            cached_tokens=int(usage.get("prompt_tokens_details", {}).get("cached_tokens", usage.get("cached_tokens", 0)) or 0),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            cost_usd=float(usage.get("cost", 0.0) or 0.0),
            latency_ms=int((monotonic() - started_at) * 1000),
        )
        self.record(call)
        return call
