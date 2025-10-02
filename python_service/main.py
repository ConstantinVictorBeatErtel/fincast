from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sys
from pathlib import Path

# Add parent directory to path to import scripts module
sys.path.insert(0, str(Path(__file__).parent.parent))

# Reuse existing logic from the repo
from scripts.fetch_yfinance import fetch_financials

app = FastAPI()

# Add CORS middleware to allow requests from localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/yf")
def yf(ticker: str | None = None):
    if not ticker:
        raise HTTPException(status_code=400, detail="Missing ticker")
    data = fetch_financials(ticker)
    return JSONResponse(content=data)


