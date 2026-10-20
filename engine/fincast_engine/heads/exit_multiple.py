"""Exit-multiple valuation head."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from ..identities import compose
from ..schema import MarketData, ValuationResult


class ExitMultipleHead:
    name = "exit_multiple"

    def value(
        self,
        fcf_path: Sequence[float],
        drivers: Mapping[str, object],
        market: MarketData,
    ) -> ValuationResult:
        if not fcf_path:
            raise ValueError("fcf_path must not be empty")
        multiple = float(drivers.get("exit_multiple", 10.0))
        wacc = float(drivers.get("wacc", 0.10))
        if multiple <= 0 or wacc <= -1:
            raise ValueError("exit_multiple must be positive and wacc must be greater than -100%")
        terminal_ebitda = drivers.get("terminal_ebitda")
        if terminal_ebitda is None:
            starting_revenue = drivers.get("starting_revenue", drivers.get("initial_revenue"))
            if starting_revenue is None:
                raise ValueError("exit multiple requires terminal_ebitda or starting_revenue")
            forecast = compose(
                drivers,
                horizon=len(fcf_path),
                starting_revenue=float(starting_revenue),
                previous_nwc=float(drivers.get("previous_nwc", 0.0)),
            )
            terminal_ebitda = forecast["ebit"][-1] + forecast["d_and_a"][-1]
        terminal_value = float(terminal_ebitda) * multiple
        enterprise_value = terminal_value / (1.0 + wacc) ** len(fcf_path)
        equity_value = enterprise_value - market.net_debt
        return ValuationResult(
            head=self.name,
            enterprise_value=enterprise_value,
            equity_value=equity_value,
            per_share_value=equity_value / market.diluted_shares,
            assumptions={"wacc": wacc, "exit_multiple": multiple},
            terminal_value=terminal_value,
        )

