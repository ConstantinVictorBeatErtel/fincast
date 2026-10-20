"""Invert canonical historical statements into driver paths."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

from .schema import FinancialPeriod, as_float


def _normalise(history: Any) -> list[tuple[date, dict[str, float]]]:
    grouped: dict[date, dict[str, float]] = defaultdict(dict)
    if isinstance(history, Mapping):
        for period, values in history.items():
            period_date = period if isinstance(period, date) else date.fromisoformat(str(period))
            grouped[period_date].update({str(key): as_float(value) for key, value in values.items()})
    else:
        for item in history:
            if isinstance(item, FinancialPeriod):
                grouped[item.period_end_date][str(item.line_item)] = item.value
                continue
            if not isinstance(item, Mapping):
                raise TypeError("history must contain FinancialPeriod or mapping rows")
            if "line_item" in item:
                period = item.get("period_end_date") or item.get("period")
                period_date = period if isinstance(period, date) else date.fromisoformat(str(period))
                grouped[period_date][str(item["line_item"])] = as_float(item.get("value"))
            else:
                period = item.get("period_end_date") or item.get("period")
                period_date = period if isinstance(period, date) else date.fromisoformat(str(period))
                grouped[period_date].update({str(key): as_float(value) for key, value in item.items() if key not in {"period", "period_end_date"}})
    return sorted(grouped.items())


def from_history(history: Any) -> dict[str, Any]:
    """Return driver paths and reconstruction metadata from reported history.

    Totals are never copied into the returned driver set.  ``starting_revenue``
    and ``previous_nwc`` are context values needed to seed deterministic
    composition; all forecast quantities remain in the declared driver set.
    """

    periods = _normalise(history)
    if not periods:
        raise ValueError("at least one historical period is required")

    paths: dict[str, list[float]] = defaultdict(list)
    previous_revenue: float | None = None
    first_nwc: float | None = None
    first_delta_nwc: float | None = None
    for _, raw in periods:
        revenue = as_float(raw.get("revenue"))
        cogs = as_float(raw.get("cogs"))
        gross_profit = as_float(raw.get("gross_profit"), revenue - cogs)
        opex = as_float(raw.get("opex"))
        ebit = as_float(raw.get("ebit"), gross_profit - opex)
        nopat = as_float(raw.get("nopat"))
        receivables = as_float(raw.get("receivables"))
        inventory = as_float(raw.get("inventory"))
        payables = as_float(raw.get("payables"))
        nwc = as_float(raw.get("nwc"), receivables + inventory - payables)
        if first_nwc is None:
            first_nwc = nwc
            if "delta_nwc" in raw:
                first_delta_nwc = as_float(raw.get("delta_nwc"))

        paths["revenue_growth"].append(0.0 if previous_revenue in (None, 0.0) else revenue / previous_revenue - 1.0)
        paths["gross_margin_pct"].append(_ratio(gross_profit, revenue))
        paths["opex_pct"].append(_ratio(opex, revenue))
        paths["tax_rate"].append(1.0 - _ratio(nopat, ebit) if ebit else 0.0)
        paths["da_pct"].append(_ratio(as_float(raw.get("d_and_a")), revenue))
        paths["capex_pct"].append(_ratio(as_float(raw.get("capex")), revenue))
        paths["dso"].append(_ratio(receivables * 365.0, revenue))
        paths["dio"].append(_ratio(inventory * 365.0, cogs))
        paths["dpo"].append(_ratio(payables * 365.0, cogs))
        if "units" in raw:
            paths["units"].append(as_float(raw["units"]))
        if "asp" in raw:
            paths["asp"].append(as_float(raw["asp"]))
        previous_revenue = revenue

    result: dict[str, Any] = dict(paths)
    result["starting_revenue"] = as_float(periods[0][1].get("revenue"))
    result["previous_nwc"] = (first_nwc - first_delta_nwc) if first_nwc is not None and first_delta_nwc is not None else (first_nwc or 0.0)
    result["periods"] = [period.isoformat() for period, _ in periods]
    return result


def _ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


extract = from_history
