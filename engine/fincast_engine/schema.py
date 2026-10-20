"""Canonical financial and valuation types shared by every engine layer."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


DRIVER_NAMES = (
    "units",
    "asp",
    "revenue_growth",
    "gross_margin_pct",
    "opex_pct",
    "tax_rate",
    "da_pct",
    "capex_pct",
    "dso",
    "dio",
    "dpo",
    "wacc",
    "terminal_growth",
    "exit_multiple",
)


class LineItem(StrEnum):
    """The fixed taxonomy accepted by the ingest layer."""

    REVENUE = "revenue"
    COGS = "cogs"
    GROSS_PROFIT = "gross_profit"
    OPEX = "opex"
    EBIT = "ebit"
    NOPAT = "nopat"
    D_AND_A = "d_and_a"
    CAPEX = "capex"
    RECEIVABLES = "receivables"
    INVENTORY = "inventory"
    PAYABLES = "payables"
    NWC = "nwc"
    DELTA_NWC = "delta_nwc"
    FCF = "fcf"
    UNITS = "units"
    ASP = "asp"


class FinancialPeriod(BaseModel):
    """One normalised company-period-line item."""

    model_config = ConfigDict(extra="forbid")

    company_id: str
    fiscal_year: int
    fiscal_quarter: int | None = Field(default=None, ge=1, le=4)
    period_end_date: date
    line_item: LineItem | str
    value: float
    segment_id: str | None = None
    source_filing_id: str | None = None
    restated_from_id: str | None = None

    @model_validator(mode="after")
    def finite_value(self) -> "FinancialPeriod":
        if self.value != self.value or self.value in (float("inf"), float("-inf")):
            raise ValueError("financial values must be finite")
        return self


class DriverPath(BaseModel):
    """A point-estimate path with optional uncertainty fields for future use."""

    model_config = ConfigDict(extra="forbid")

    name: str
    values: list[float]
    low: list[float] | None = None
    high: list[float] | None = None


class MarketData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    market_cap: float
    net_debt: float = 0.0
    diluted_shares: float = Field(gt=0)
    current_price: float | None = None


class ValuationResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    head: str
    enterprise_value: float
    equity_value: float
    per_share_value: float
    assumptions: dict[str, float]
    present_value_fcf: float = 0.0
    terminal_value: float = 0.0


class ForecastRun(BaseModel):
    model_config = ConfigDict(extra="allow")

    run_id: str
    company_id: str
    as_of_date: date
    head: str
    status: Literal["running", "succeeded", "failed"] = "running"
    config_hash: str
    total_cost_usd: float = 0.0
    created_at: datetime | None = None


def as_float(value: Any, default: float = 0.0) -> float:
    """Convert common numeric payloads while keeping NaN out of the engine."""

    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if result == result and abs(result) != float("inf") else default

