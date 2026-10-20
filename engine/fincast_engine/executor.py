"""Bounded graph execution with research fan-out and critic loops."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .cache import ResultCache
from .contracts import DriverEstimate, NodeContract, NodeResult
from .critics.coherence import CoherenceCritic, CoherenceVerdict, PassThroughCoherenceCritic
from .critics.grounding import GroundingCritic, GroundingVerdict, PassThroughGroundingCritic


Researcher = Callable[[NodeContract, str], DriverEstimate | Awaitable[DriverEstimate]]
CacheKeyFactory = Callable[[NodeContract], str]


def _as_value(prior: float | list[float]) -> float | list[float]:
    return list(prior) if isinstance(prior, list) else float(prior)


def prior_estimate(contract: NodeContract, prior: float | list[float], *, confidence: str = "high") -> DriverEstimate:
    return DriverEstimate(
        driver_name=contract.driver_name,
        value=_as_value(prior),
        low=_as_value(prior),
        high=_as_value(prior),
        confidence=confidence,  # type: ignore[arg-type]
        reasoning_summary="Historical prior used; no model call was required.",
    )


async def run_research_tier(agents: list[Callable[[], Awaitable[Any]]], cache_warmup_delay: float = 2.0) -> list[Any]:
    """Warm the shared prompt prefix before fanning out research calls."""

    if not agents:
        return []
    first = await agents[0]()
    if len(agents) == 1:
        return [first]
    if cache_warmup_delay > 0:
        await asyncio.sleep(cache_warmup_delay)
    rest = await asyncio.gather(*(agent() for agent in agents[1:]))
    return [first, *rest]


@dataclass
class ForecastExecution:
    run_id: str
    node_results: dict[str, NodeResult]
    coherence: CoherenceVerdict = field(default_factory=CoherenceVerdict)

    @property
    def driver_set(self) -> dict[str, float | list[float]]:
        return {result.value.driver_name: result.value.value for result in self.node_results.values()}


class ForecastExecutor:
    def __init__(
        self,
        contracts: Iterable[NodeContract],
        *,
        run_id: str,
        researcher: Researcher | None = None,
        grounding_critic: GroundingCritic | None = None,
        coherence_critic: CoherenceCritic | None = None,
        cache: ResultCache | None = None,
        cache_key_factory: CacheKeyFactory | None = None,
        cache_warmup_delay: float = 2.0,
    ) -> None:
        self.contracts = list(contracts)
        self.run_id = run_id
        self.researcher = researcher
        self.grounding_critic = grounding_critic or PassThroughGroundingCritic()
        self.coherence_critic = coherence_critic or PassThroughCoherenceCritic()
        self.cache = cache
        self.cache_key_factory = cache_key_factory
        self.cache_warmup_delay = cache_warmup_delay

    async def resolve_node(
        self,
        contract: NodeContract,
        prior: float | list[float],
        *,
        retry_feedback: str = "",
    ) -> NodeResult:
        cache_key = self.cache_key_factory(contract) if self.cache and self.cache_key_factory else None
        if cache_key and self.cache:
            cached = await self.cache.get(cache_key)
            if cached is not None:
                cached_value = cached.get("value", cached) if isinstance(cached, Mapping) else cached
                estimate = cached_value if isinstance(cached_value, DriverEstimate) else DriverEstimate.model_validate(cached_value)
                return NodeResult(
                    run_id=self.run_id,
                    node_id=contract.id,
                    value=estimate,
                    confidence=estimate.confidence,
                    critic_verdict={"cache_hit": True},
                    cited_evidence=estimate.cited_evidence,
                )
        if self.researcher is None:
            estimate = prior_estimate(contract, prior)
            return NodeResult(run_id=self.run_id, node_id=contract.id, value=estimate, confidence=estimate.confidence, cited_evidence=[])

        last_issues: list[str] = []
        for attempt in range(contract.max_retries + 1):
            try:
                estimate = self.researcher(contract, retry_feedback)
                if inspect.isawaitable(estimate):
                    estimate = await estimate
                if not isinstance(estimate, DriverEstimate):
                    estimate = DriverEstimate.model_validate(estimate)
                last_issues = contract.validate_estimate(estimate, prior)
                if last_issues:
                    retry_feedback = "; ".join(last_issues)
                    continue
                verdict: GroundingVerdict = await self.grounding_critic.check(estimate, estimate.cited_evidence)
                if not verdict.supported:
                    retry_feedback = verdict.issue or "cited evidence did not support the estimate"
                    last_issues = [retry_feedback]
                    continue
                result = NodeResult(
                    run_id=self.run_id,
                    node_id=contract.id,
                    value=estimate,
                    confidence=estimate.confidence,
                    retry_count=attempt,
                    critic_verdict=verdict.model_dump(),
                    cited_evidence=estimate.cited_evidence,
                )
                if cache_key and self.cache:
                    await self.cache.set(cache_key, result.model_dump(mode="json"))
                return result
            except Exception as exc:  # bounded retry; fallback is deliberately explicit
                last_issues = [str(exc)]
                retry_feedback = str(exc)

        fallback = prior_estimate(contract, prior, confidence="low")
        return NodeResult(
            run_id=self.run_id,
            node_id=contract.id,
            value=fallback,
            confidence="low",
            used_fallback=True,
            retry_count=contract.max_retries,
            critic_verdict={"supported": False, "issue": "; ".join(last_issues)},
        )

    async def run(self, priors: Mapping[str, float | list[float]] | Callable[[NodeContract], float | list[float]]) -> ForecastExecution:
        def get_prior(contract: NodeContract) -> float | list[float]:
            if callable(priors):
                return priors(contract)
            return priors.get(contract.driver_name, 0.0)

        async def resolve(contract: NodeContract, feedback: str = "") -> NodeResult:
            return await self.resolve_node(contract, get_prior(contract), retry_feedback=feedback)

        agents = [lambda contract=contract: resolve(contract) for contract in self.contracts]
        resolved = await run_research_tier(agents, self.cache_warmup_delay) if self.researcher else await asyncio.gather(*(agent() for agent in agents))
        results = {item.node_id: item for item in resolved}

        coherence = CoherenceVerdict()
        for _ in range(2):
            coherence = await self.coherence_critic.check({key: value.value.value for key, value in results.items()})
            if not coherence.contradictions:
                break
            flagged = {node_id for contradiction in coherence.contradictions for node_id in contradiction.node_ids}
            if not flagged:
                break
            for node_id in flagged:
                contract = next((item for item in self.contracts if item.id == node_id), None)
                if contract:
                    results[node_id] = await resolve(contract, "coherence issue: " + "; ".join(c.issue for c in coherence.contradictions if node_id in c.node_ids))
        return ForecastExecution(run_id=self.run_id, node_results=results, coherence=coherence)
