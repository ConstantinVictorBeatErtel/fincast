from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from engine.fincast_engine.cli import DEFAULT_PRIORS
from engine.fincast_engine.executor import ForecastExecutor
from engine.fincast_engine.extract import from_history
from engine.fincast_engine.heads import DCFHead, ExitMultipleHead, ReverseDCFHead
from engine.fincast_engine.identities import compose
from engine.fincast_engine.schema import MarketData

# Import the existing fetcher from your repo
from scripts.fetch_yfinance import fetch_financials

app = FastAPI()


class ForecastRequest(BaseModel):
    ticker: str
    head: str = Field(default="reverse_dcf", pattern="^(dcf|reverse_dcf|exit_multiple)$")
    historical_financials: list[dict] = Field(default_factory=list)
    horizon: int = Field(default=5, ge=1, le=20)
    revenue: float = Field(default=100.0, gt=0)
    market_cap: float = Field(default=100.0, gt=0)
    net_debt: float = 0.0
    diluted_shares: float = Field(default=10.0, gt=0)
    current_price: float | None = None
    wacc: float = Field(default=0.10, gt=-1, lt=1)
    terminal_growth: float = Field(default=0.025, gt=-1, lt=1)
    exit_multiple: float = Field(default=10.0, gt=0)


@app.get("/yf")
def yf(ticker: str | None = None):
    if not ticker:
        raise HTTPException(status_code=400, detail="Missing ticker")
    data = fetch_financials(ticker)
    return JSONResponse(content=data)


@app.post("/forecast")
def forecast(request: ForecastRequest):
    """Run the deterministic engine over canonical history without model calls.

    Model-backed resolution remains available from the Python package; this
    endpoint provides a safe M3/M4 API path for the existing Next.js service.
    """

    extracted = from_history(request.historical_financials) if request.historical_financials else {
        "starting_revenue": request.revenue,
        "previous_nwc": 0.0,
    }
    contracts = __import__("engine.fincast_engine.cli", fromlist=["load_contracts"]).load_contracts()
    priors = {
        contract.driver_name: float(extracted.get(contract.driver_name, [DEFAULT_PRIORS[contract.driver_name]])[-1] if isinstance(extracted.get(contract.driver_name), list) else extracted.get(contract.driver_name, DEFAULT_PRIORS[contract.driver_name]))
        for contract in contracts
    }
    execution = __import__("asyncio").run(ForecastExecutor(contracts, run_id=f"api-{request.ticker}", cache_warmup_delay=0).run(priors))
    drivers = dict(extracted)
    drivers.update(execution.driver_set)
    for name, default in DEFAULT_PRIORS.items():
        if name in {"wacc", "terminal_growth", "exit_multiple"}:
            continue
        value = drivers.get(name, default)
        value = value[-1] if isinstance(value, list) and value else value
        drivers[name] = [float(value or default)] * request.horizon
    statement = compose(drivers, horizon=request.horizon, starting_revenue=float(drivers.get("starting_revenue", request.revenue)), previous_nwc=float(drivers.get("previous_nwc", 0.0)))
    market = MarketData(
        ticker=request.ticker,
        market_cap=request.market_cap,
        net_debt=request.net_debt,
        diluted_shares=request.diluted_shares,
        current_price=request.current_price,
    )
    valuation_drivers = {**drivers, "wacc": request.wacc, "terminal_growth": request.terminal_growth, "exit_multiple": request.exit_multiple}
    head = {"dcf": DCFHead(), "reverse_dcf": ReverseDCFHead(), "exit_multiple": ExitMultipleHead()}[request.head]
    valuation = head.value(statement["fcf"], valuation_drivers, market)
    return {"ticker": request.ticker, "head": request.head, "drivers": execution.driver_set, "statement": statement, "valuation": valuation.model_dump()}

