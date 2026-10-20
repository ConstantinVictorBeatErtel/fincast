"""Command line entry point for deterministic and model-backed forecasts."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from .contracts import NodeContract
from .executor import ForecastExecutor
from .extract import from_history
from .heads import DCFHead, ExitMultipleHead, ReverseDCFHead
from .identities import compose
from .schema import MarketData


DEFAULT_PRIORS = {
    "revenue_growth": 0.05,
    "gross_margin_pct": 0.45,
    "opex_pct": 0.25,
    "tax_rate": 0.21,
    "da_pct": 0.05,
    "capex_pct": 0.04,
    "dso": 45.0,
    "dio": 30.0,
    "dpo": 35.0,
    "wacc": 0.10,
    "terminal_growth": 0.025,
    "exit_multiple": 10.0,
}


def load_contracts() -> list[NodeContract]:
    config_path = Path(__file__).resolve().parents[1] / "config" / "nodes.yaml"
    return [NodeContract.model_validate(item) for item in yaml.safe_load(config_path.read_text())]


def _last(value: Any, default: float) -> float:
    if isinstance(value, list):
        return float(value[-1]) if value else default
    return float(value) if value is not None else default


async def forecast(args: argparse.Namespace) -> dict[str, Any]:
    history = json.loads(Path(args.financials).read_text()) if args.financials else None
    extracted = from_history(history) if history else {
        "starting_revenue": args.revenue,
        "previous_nwc": 0.0,
        "revenue_growth": [0.05] * args.horizon,
        "gross_margin_pct": [0.45] * args.horizon,
        "opex_pct": [0.25] * args.horizon,
        "tax_rate": [0.21] * args.horizon,
        "da_pct": [0.05] * args.horizon,
        "capex_pct": [0.04] * args.horizon,
        "dso": [45.0] * args.horizon,
        "dio": [30.0] * args.horizon,
        "dpo": [35.0] * args.horizon,
    }
    priors = {contract.driver_name: _last(extracted.get(contract.driver_name), DEFAULT_PRIORS[contract.driver_name]) for contract in load_contracts()}
    executor = ForecastExecutor(load_contracts(), run_id=f"cli-{args.ticker}-{date.today().isoformat()}", cache_warmup_delay=0)
    execution = await executor.run(priors)
    drivers: dict[str, Any] = dict(extracted)
    drivers.update(execution.driver_set)
    horizon = args.horizon
    for name in ("revenue_growth", "gross_margin_pct", "opex_pct", "tax_rate", "da_pct", "capex_pct", "dso", "dio", "dpo"):
        drivers[name] = [float(_last(drivers.get(name), DEFAULT_PRIORS[name]))] * horizon
    statement = compose(drivers, horizon=horizon, starting_revenue=float(drivers["starting_revenue"]), previous_nwc=float(drivers.get("previous_nwc", 0.0)))
    market = MarketData(ticker=args.ticker, market_cap=args.market_cap, net_debt=args.net_debt, diluted_shares=args.shares, current_price=args.price)
    valuation_drivers = {**drivers, "wacc": args.wacc, "terminal_growth": args.terminal_growth, "exit_multiple": args.exit_multiple}
    head = {"dcf": DCFHead(), "reverse_dcf": ReverseDCFHead(), "exit_multiple": ExitMultipleHead()}[args.head]
    valuation = head.value(statement["fcf"], valuation_drivers, market)
    return {"ticker": args.ticker, "head": args.head, "drivers": execution.driver_set, "statement": statement, "valuation": valuation.model_dump()}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fincast_engine")
    subparsers = parser.add_subparsers(dest="command", required=True)
    forecast_parser = subparsers.add_parser("forecast")
    forecast_parser.add_argument("--ticker", required=True)
    forecast_parser.add_argument("--head", choices=["dcf", "reverse_dcf", "exit_multiple"], default="reverse_dcf")
    forecast_parser.add_argument("--financials", help="JSON file containing canonical historical statement periods")
    forecast_parser.add_argument("--horizon", type=int, default=5)
    forecast_parser.add_argument("--revenue", type=float, default=100.0)
    forecast_parser.add_argument("--market-cap", type=float, default=100.0)
    forecast_parser.add_argument("--net-debt", type=float, default=0.0)
    forecast_parser.add_argument("--shares", type=float, default=10.0)
    forecast_parser.add_argument("--price", type=float)
    forecast_parser.add_argument("--wacc", type=float, default=0.10)
    forecast_parser.add_argument("--terminal-growth", type=float, default=0.025)
    forecast_parser.add_argument("--exit-multiple", type=float, default=10.0)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "forecast":
        print(json.dumps(asyncio.run(forecast(args)), indent=2))


if __name__ == "__main__":
    main()
