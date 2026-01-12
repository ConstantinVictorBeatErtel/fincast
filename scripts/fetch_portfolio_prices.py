#!/usr/bin/env python3
"""
Python script to fetch historical price data for portfolio analysis using yfinance.
Returns 5 years of daily prices for given tickers.
Usage: python fetch_portfolio_prices.py tick1 tick2 tick3 ...
"""
import sys
import json
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

def fetch_prices(tickers):
    if not tickers:
        return {}
        
    # Fetch 5 years of historical data
    end_date = datetime.now()
    start_date = end_date - timedelta(days=5*365)
    
    result = {}
    
    try:
        sys.stderr.write(f"Downloading data for {tickers} from {start_date.date()} to {end_date.date()}\n")
        
        # Always use group_by='ticker' to try to get consistent structure
        # auto_adjust=True handles splits/dividends
        data = yf.download(
            tickers,
            start=start_date,
            end=end_date,
            interval='1d',
            progress=False,
            auto_adjust=True,
            group_by='ticker'
        )
        
        if data.empty:
            sys.stderr.write("Returned data is empty\n")
            return {t: [] for t in tickers}

        for ticker in tickers:
            prices = []
            try:
                # Determine how to access data for this ticker
                df = None
                
                # Check if columns are MultiIndex (Ticker, Price)
                if isinstance(data.columns, pd.MultiIndex):
                    try:
                        df = data[ticker]
                    except KeyError:
                        sys.stderr.write(f"Ticker {ticker} not found in MultiIndex columns\n")
                        df = None
                else:
                    # Flat Index (usually happens if only 1 ticker is requested, even with group_by sometimes?)
                    # If flat, assume this IS the data for the single ticker
                    # But verify ticker name? No, yf doesn't include ticker in flat columns (just Open, Close)
                    if len(tickers) == 1 and tickers[0] == ticker:
                        df = data
                    else:
                        # If we have multiple tickers but flat index? Should not happen with group_by='ticker'.
                        # Unless yfinance failed for others.
                        # We'll assume if flat request mapped to this ticker.
                         df = data
                
                if df is not None and not df.empty:
                    # Check for Close column
                    if 'Close' in df.columns:
                        for index, row in df.iterrows():
                            try:
                                close_val = float(row['Close'])
                                if str(close_val) != 'nan':
                                    prices.append({
                                        'date': index.strftime('%Y-%m-%d'),
                                        'close': close_val
                                    })
                            except:
                                pass
                        sys.stderr.write(f"Parsed {len(prices)} prices for {ticker}\n")
                    else:
                        sys.stderr.write(f"No 'Close' column for {ticker}. Columns: {df.columns}\n")
                
            except Exception as e:
                sys.stderr.write(f"Error processing {ticker}: {e}\n")
            
            result[ticker] = prices
                    
    except Exception as e:
        sys.stderr.write(f"Bulk download error: {str(e)}\n")
        # Fallback: try fetching one by one
        for ticker in tickers:
            try:
                sys.stderr.write(f"Fallback fetching {ticker}...\n")
                hist = yf.Ticker(ticker).history(start=start_date, end=end_date, interval='1d', auto_adjust=True)
                prices = []
                if not hist.empty and 'Close' in hist.columns:
                    for index, row in hist.iterrows():
                        prices.append({
                            'date': index.strftime('%Y-%m-%d'),
                            'close': float(row['Close'])
                        })
                result[ticker] = prices
            except Exception as e2:
                sys.stderr.write(f"Fallback error for {ticker}: {str(e2)}\n")
                result[ticker] = []

    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python fetch_portfolio_prices.py TICKER1 [TICKER2 ...]"}))
        sys.exit(1)
        
    tickers = sys.argv[1:]
    data = fetch_prices(tickers)
    print(json.dumps(data))
