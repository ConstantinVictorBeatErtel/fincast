from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

# Import the existing fetcher from your repo
from scripts.fetch_yfinance import fetch_financials

app = FastAPI()


@app.get("/yf")
def yf(ticker: str | None = None):
    if not ticker:
        raise HTTPException(status_code=400, detail="Missing ticker")
    data = fetch_financials(ticker)
    return JSONResponse(content=data)


