import asyncio

from engine.fincast_engine.contracts import DriverEstimate, NodeContract
from engine.fincast_engine.critics.grounding import GroundingVerdict
from engine.fincast_engine.executor import ForecastExecutor


class RejectFirstGrounding:
    def __init__(self):
        self.calls = 0

    async def check(self, estimate, evidence):
        self.calls += 1
        return GroundingVerdict(supported=self.calls > 1, issue="use the cited filing span")


def test_grounding_retry_is_bounded_and_records_retry_count():
    contract = NodeContract.model_validate({
        "id": "research.gross_margin",
        "output": {"name": "gross_margin_pct", "min": 0.05, "max": 0.95},
        "max_retries": 2,
    })
    grounding = RejectFirstGrounding()
    calls = 0

    async def researcher(node, feedback):
        nonlocal calls
        calls += 1
        return DriverEstimate(
            driver_name=node.driver_name,
            value=0.4,
            low=0.4,
            high=0.4,
            confidence="high",
            cited_evidence=[],
            reasoning_summary="stable margin",
        )

    execution = asyncio.run(ForecastExecutor(
        [contract],
        run_id="run-1",
        researcher=researcher,
        grounding_critic=grounding,
        cache_warmup_delay=0,
    ).run({"gross_margin_pct": 0.4}))
    result = execution.node_results[contract.id]
    assert calls == 2
    assert result.retry_count == 1
    assert result.used_fallback is False
