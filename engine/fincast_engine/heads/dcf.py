"""Discounted cash-flow valuation head."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..schema import MarketData, ValuationResult


def _number(drivers: Mapping[str, object], key: str, default: float) -> float:
    value = drivers.get(key, default)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return float(value[-1]) if value else default
    return float(value)


class DCFHead:
    name = "dcf"

    def value(
        self,
        fcf_path: Sequence[float],
        drivers: Mapping[str, object],
        market: MarketData,
    ) -> ValuationResult:
        wacc = _number(drivers, "wacc", 0.10)
        terminal_growth = _number(drivers, "terminal_growth", 0.025)
        if wacc <= terminal_growth:
            raise ValueError("wacc must be greater than terminal_growth")
        cashflows = [float(cashflow) for cashflow in fcf_path]
        if not cashflows:
            raise ValueError("fcf_path must not be empty")
        present_value_fcf = sum(cashflow / (1.0 + wacc) ** year for year, cashflow in enumerate(cashflows, start=1))
        terminal_value = cashflows[-1] * (1.0 + terminal_growth) / (wacc - terminal_growth)
        enterprise_value = present_value_fcf + terminal_value / (1.0 + wacc) ** len(cashflows)
        equity_value = enterprise_value - market.net_debt
        return ValuationResult(
            head=self.name,
            enterprise_value=enterprise_value,
            equity_value=equity_value,
            per_share_value=equity_value / market.diluted_shares,
            assumptions={"wacc": wacc, "terminal_growth": terminal_growth},
            present_value_fcf=present_value_fcf,
            terminal_value=terminal_value,
        )


def dcf_value(fcf_path: Sequence[float], wacc: float, terminal_growth: float) -> float:
    """Return enterprise value for reverse-DCF root finding."""

    if wacc <= terminal_growth:
        raise ValueError("wacc must be greater than terminal_growth")
    cashflows = [float(cashflow) for cashflow in fcf_path]
    if not cashflows:
        raise ValueError("fcf_path must not be empty")
    pv = sum(cashflow / (1.0 + wacc) ** year for year, cashflow in enumerate(cashflows, 1))
    terminal = cashflows[-1] * (1.0 + terminal_growth) / (wacc - terminal_growth)
    return pv + terminal / (1.0 + wacc) ** len(cashflows)

