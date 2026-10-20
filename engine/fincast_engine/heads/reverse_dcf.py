"""Reverse DCF head: solve for the growth implied by today's market value."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ..identities import compose
from ..schema import MarketData, ValuationResult
from .dcf import dcf_value


def _solve_brent(function: Any, lower: float, upper: float) -> float:
    try:
        from scipy.optimize import brentq

        return float(brentq(function, lower, upper))
    except ImportError:
        low_value = function(lower)
        high_value = function(upper)
        if low_value * high_value > 0:
            raise ValueError("reverse DCF target is outside the configured growth bracket")
        for _ in range(100):
            midpoint = (lower + upper) / 2.0
            midpoint_value = function(midpoint)
            if abs(midpoint_value) < 1e-8:
                return midpoint
            if low_value * midpoint_value <= 0:
                upper, high_value = midpoint, midpoint_value
            else:
                lower, low_value = midpoint, midpoint_value
        return (lower + upper) / 2.0


def _forecast_fcf(drivers: Mapping[str, object], growth: float, horizon: int) -> list[float]:
    forecast_drivers = dict(drivers)
    forecast_drivers["revenue_growth"] = [growth] * horizon
    starting_revenue = forecast_drivers.get("starting_revenue", forecast_drivers.get("initial_revenue"))
    if starting_revenue is None:
        raise ValueError("reverse DCF requires starting_revenue")
    composed = compose(
        forecast_drivers,
        horizon=horizon,
        starting_revenue=float(starting_revenue),
        previous_nwc=float(forecast_drivers.get("previous_nwc", 0.0)),
    )
    return composed["fcf"]


def implied_growth(
    market_cap: float,
    net_debt: float,
    drivers: Mapping[str, object],
    wacc: float,
    *,
    lower: float = -0.20,
    upper: float = 0.60,
    horizon: int | None = None,
) -> float:
    """Solve the constant revenue CAGR implied by a market enterprise value."""

    horizon = horizon or int(drivers.get("horizon", 5))
    terminal_growth = float(drivers.get("terminal_growth", 0.025))
    target = float(market_cap) + float(net_debt)

    def residual(growth: float) -> float:
        return dcf_value(_forecast_fcf(drivers, growth, horizon), wacc, terminal_growth) - target

    lower_value = residual(lower)
    upper_value = residual(upper)
    if lower_value * upper_value > 0:
        raise ValueError("market value is outside the reverse DCF growth bracket")
    return _solve_brent(residual, lower, upper)


class ReverseDCFHead:
    name = "reverse_dcf"

    def value(
        self,
        fcf_path: Sequence[float],
        drivers: Mapping[str, object],
        market: MarketData,
    ) -> ValuationResult:
        wacc = float(drivers.get("wacc", 0.10))
        growth = implied_growth(
            market.market_cap,
            market.net_debt,
            drivers,
            wacc,
            horizon=len(fcf_path) or int(drivers.get("horizon", 5)),
        )
        enterprise_value = market.market_cap + market.net_debt
        return ValuationResult(
            head=self.name,
            enterprise_value=enterprise_value,
            equity_value=market.market_cap,
            per_share_value=market.market_cap / market.diluted_shares,
            assumptions={"wacc": wacc, "implied_revenue_growth": growth, "horizon": float(len(fcf_path))},
        )

