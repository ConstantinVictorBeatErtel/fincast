"""Pure deterministic composition of drivers into financial statement totals."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


class IdentityError(ValueError):
    """Raised when a driver set cannot be composed safely."""


def _path(value: Any, horizon: int, name: str, default: float = 0.0) -> list[float]:
    if value is None:
        return [default] * horizon
    if isinstance(value, Mapping):
        values = list(value.values())
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        values = list(value)
    else:
        values = [value] * horizon
    if not values:
        return [default] * horizon
    if len(values) == 1 and horizon > 1:
        values *= horizon
    if len(values) != horizon:
        raise IdentityError(f"{name} must contain {horizon} values, got {len(values)}")
    try:
        return [float(item) for item in values]
    except (TypeError, ValueError) as exc:
        raise IdentityError(f"{name} contains a non-numeric value") from exc


def _safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    return numerator / denominator if denominator else default


def compose(
    drivers: Mapping[str, Any],
    *,
    horizon: int | None = None,
    starting_revenue: float | None = None,
    previous_nwc: float = 0.0,
    segments: Mapping[str, Mapping[str, Any]] | None = None,
    starting_segment_revenue: Mapping[str, float] | None = None,
) -> dict[str, list[float]]:
    """Compose a forecast from drivers using only accounting identities.

    ``starting_revenue`` is the last known revenue before the returned path.
    For reconstruction, callers can pass the first period's revenue and a first
    growth value of zero.  Segment revenue uses ``units * asp`` when both are
    available, otherwise it rolls forward with segment revenue growth.
    """

    if horizon is None:
        for key in ("revenue_growth", "gross_margin_pct", "opex_pct", "tax_rate"):
            candidate = drivers.get(key)
            if isinstance(candidate, Sequence) and not isinstance(candidate, (str, bytes)):
                horizon = len(candidate)
                break
        horizon = horizon or 1
    if horizon < 1:
        raise IdentityError("horizon must be positive")

    growth = _path(drivers.get("revenue_growth"), horizon, "revenue_growth")
    gross_margin = _path(drivers.get("gross_margin_pct"), horizon, "gross_margin_pct")
    opex_pct = _path(drivers.get("opex_pct"), horizon, "opex_pct")
    tax_rate = _path(drivers.get("tax_rate"), horizon, "tax_rate")
    da_pct = _path(drivers.get("da_pct"), horizon, "da_pct")
    capex_pct = _path(drivers.get("capex_pct"), horizon, "capex_pct")
    dso = _path(drivers.get("dso"), horizon, "dso")
    dio = _path(drivers.get("dio"), horizon, "dio")
    dpo = _path(drivers.get("dpo"), horizon, "dpo")

    if starting_revenue is None:
        starting_revenue = drivers.get("starting_revenue", drivers.get("initial_revenue"))
    if starting_revenue is None:
        raise IdentityError("starting_revenue is required because revenue is a computed total")
    prior_revenue = float(starting_revenue)

    segment_map = segments or drivers.get("segments")
    starting_segment_revenue = starting_segment_revenue or drivers.get("starting_segment_revenue", {})
    revenues: list[float] = []
    segment_paths: dict[str, list[float]] = {}
    if segment_map:
        for segment_id, segment in segment_map.items():
            units = segment.get("units")
            asp = segment.get("asp")
            segment_growth = _path(segment.get("revenue_growth"), horizon, f"{segment_id}.revenue_growth", 0.0)
            prior_segment = float(starting_segment_revenue.get(segment_id, 0.0))
            values: list[float] = []
            for index in range(horizon):
                if units is not None and asp is not None:
                    value = _path(units, horizon, f"{segment_id}.units")[index] * _path(asp, horizon, f"{segment_id}.asp")[index]
                elif prior_segment:
                    value = prior_segment * (1.0 + segment_growth[index])
                else:
                    value = 0.0
                values.append(value)
                prior_segment = value
            segment_paths[segment_id] = values
        revenues = [sum(segment_paths[segment_id][index] for segment_id in segment_paths) for index in range(horizon)]
    else:
        for rate in growth:
            current_revenue = prior_revenue * (1.0 + rate)
            revenues.append(current_revenue)
            prior_revenue = current_revenue

    cogs = [revenue * (1.0 - margin) for revenue, margin in zip(revenues, gross_margin)]
    gross_profit = [revenue - cost for revenue, cost in zip(revenues, cogs)]
    opex = [revenue * pct for revenue, pct in zip(revenues, opex_pct)]
    ebit = [gross - operating for gross, operating in zip(gross_profit, opex)]
    nopat = [operating_profit * (1.0 - tax) for operating_profit, tax in zip(ebit, tax_rate)]
    d_and_a = [revenue * pct for revenue, pct in zip(revenues, da_pct)]
    capex = [revenue * pct for revenue, pct in zip(revenues, capex_pct)]
    receivables = [revenue * days / 365.0 for revenue, days in zip(revenues, dso)]
    inventory = [cost * days / 365.0 for cost, days in zip(cogs, dio)]
    payables = [cost * days / 365.0 for cost, days in zip(cogs, dpo)]
    nwc = [ar + stock - payable for ar, stock, payable in zip(receivables, inventory, payables)]
    delta_nwc = []
    prior_nwc = float(previous_nwc)
    for current_nwc in nwc:
        delta_nwc.append(current_nwc - prior_nwc)
        prior_nwc = current_nwc
    fcf = [cash - add - investment - change for cash, add, investment, change in zip(nopat, d_and_a, capex, delta_nwc)]

    result = {
        "revenue": revenues,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "opex": opex,
        "ebit": ebit,
        "nopat": nopat,
        "d_and_a": d_and_a,
        "capex": capex,
        "receivables": receivables,
        "inventory": inventory,
        "payables": payables,
        "nwc": nwc,
        "delta_nwc": delta_nwc,
        "fcf": fcf,
    }
    if segment_paths:
        result["segment_revenue"] = [sum(values) for values in segment_paths.values()]
        result["segment_revenue_by_id"] = segment_paths  # type: ignore[assignment]
    return result


def relative_error(actual: float, expected: float, floor: float = 1.0) -> float:
    """Stable relative error for reconstruction checks near zero."""

    denominator = max(abs(float(expected)), floor)
    return abs(float(actual) - float(expected)) / denominator

