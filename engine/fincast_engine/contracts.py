"""Pydantic contracts for model-facing nodes and their audit trail."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filing_id: str
    section: str
    char_start: int = Field(ge=0)
    char_end: int = Field(ge=0)
    quote_hash: str | None = None

    @field_validator("char_end")
    @classmethod
    def end_after_start(cls, value: int, info: Any) -> int:
        start = info.data.get("char_start")
        if start is not None and value < start:
            raise ValueError("char_end must be >= char_start")
        return value


class DriverEstimate(BaseModel):
    """The only numeric payload a research agent may return."""

    model_config = ConfigDict(extra="forbid")

    driver_name: str
    value: float | list[float]
    low: float | list[float]
    high: float | list[float]
    cited_evidence: list[Citation] = Field(default_factory=list)
    confidence: Literal["high", "low"]
    reasoning_summary: str = Field(max_length=600)

    @field_validator("driver_name")
    @classmethod
    def driver_is_declared(cls, value: str) -> str:
        from .schema import DRIVER_NAMES

        if value not in DRIVER_NAMES:
            raise ValueError(f"undeclared driver: {value}")
        return value


class NodeContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal["estimate", "discover", "critic"] = "estimate"
    tier: str = "research"
    output: dict[str, Any]
    inputs: list[str] = Field(default_factory=list)
    evidence_sections: list[str] = Field(default_factory=list)
    prior: str = "trailing_4q_median"
    fallback: Literal["prior"] = "prior"
    assertions: list[str] = Field(default_factory=list)
    critic: str | None = "grounding"
    max_retries: int = Field(default=2, ge=0, le=2)

    @property
    def driver_name(self) -> str:
        return str(self.output.get("name", self.id.rsplit(".", 1)[-1]))

    def validate_estimate(self, estimate: DriverEstimate, prior: float | list[float] | None = None) -> list[str]:
        issues: list[str] = []
        if estimate.driver_name != self.driver_name:
            issues.append(f"expected driver {self.driver_name}, got {estimate.driver_name}")
        minimum = self.output.get("min")
        maximum = self.output.get("max")
        values = estimate.value if isinstance(estimate.value, list) else [estimate.value]
        if minimum is not None and any(value < minimum for value in values):
            issues.append(f"value is below minimum {minimum}")
        if maximum is not None and any(value > maximum for value in values):
            issues.append(f"value is above maximum {maximum}")
        if prior is not None and self._assertion_needs_prior_check():
            prior_value = prior if isinstance(prior, list) else [prior] * len(values)
            if len(prior_value) == 1 and len(values) > 1:
                prior_value *= len(values)
            max_delta = float(self.output.get("max_delta", 0.08))
            if len(prior_value) == len(values) and any(abs(float(value) - float(old)) > max_delta for value, old in zip(values, prior_value)) and not estimate.cited_evidence:
                issues.append(f"value moved more than {max_delta} from prior without evidence")
        return issues

    def _assertion_needs_prior_check(self) -> bool:
        return any("prior" in assertion and "cited_evidence" in assertion for assertion in self.assertions)


class NodeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    node_id: str
    value: DriverEstimate
    confidence: Literal["high", "low"]
    used_fallback: bool = False
    retry_count: int = Field(default=0, ge=0)
    critic_verdict: dict[str, Any] | None = None
    cited_evidence: list[Citation] = Field(default_factory=list)


class DiscoveryResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_ids: list[str]
    reasoning_summary: str = Field(max_length=600)


def output_driver(contract: NodeContract, payload: Mapping[str, Any]) -> DriverEstimate:
    """Validate a raw JSON payload without allowing extra total fields."""

    allowed = {"driver_name", "value", "low", "high", "cited_evidence", "confidence", "reasoning_summary"}
    extra = set(payload) - allowed
    if extra:
        raise ValueError(f"agent returned undeclared fields: {sorted(extra)}")
    estimate = DriverEstimate.model_validate(payload)
    issues = contract.validate_estimate(estimate)
    if issues:
        raise ValueError("; ".join(issues))
    return estimate

