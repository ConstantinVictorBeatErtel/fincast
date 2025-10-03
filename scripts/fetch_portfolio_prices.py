#!/usr/bin/env python3
"""
Python script to fetch historical prices for multiple tickers.
Called from Node.js for portfolio analysis.
"""
import sys
import json
import yfinance as yf
from datetime import datetime, timedelta


def fetch_prices(tickers):
    """Fetch 5 years of historical prices for given tickers."""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=5*365)
        
        result = {}
        
        for ticker in tickers:
            try:
                # Download historical data
                hist = yf.download(
                    ticker,
                    start=start_date,
                    end=end_date,
                    interval='1d',
                    progress=False,
                    auto_adjust=True
                )
                
                if hist is not None and not hist.empty:
                    # Convert to list of daily prices
                    prices = []
                    for date, row in hist.iterrows():
                        prices.append({
                            'date': date.strftime('%Y-%m-%d'),
                            'close': float(row['Close']),
                            'volume': int(row['Volume']) if 'Volume' in row else 0
                        })
                    
                    result[ticker] = prices
                else:
                    result[ticker] = []
                    
            except Exception as e:
                print(f"Error fetching data for {ticker}: {e}", file=sys.stderr)
                result[ticker] = []
        
        return result
        
    except Exception as e:
        print(f"Error in fetch_prices: {e}", file=sys.stderr)
        return {}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python fetch_portfolio_prices.py TICKER1 TICKER2 ..."}))
        sys.exit(1)
    
    tickers = sys.argv[1:]
    result = fetch_prices(tickers)
    print(json.dumps(result))
