#!/usr/bin/env python3

import yfinance as yf
import pandas as pd
import numpy as np
import json
import sys
from datetime import datetime, timedelta

def fetch_spy_data(start_date, end_date):
    """
    Fetch SPY historical data using yfinance
    """
    try:
        # Convert string dates to datetime objects if needed
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d')
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d')
        
        print(f"Fetching SPY data from {start_date.date()} to {end_date.date()}")
        
        # Fetch SPY data
        spy = yf.Ticker("SPY")
        spy_data = spy.history(start=start_date, end=end_date)
        
        if spy_data.empty:
            print("No SPY data found")
            return None
        
        print(f"Fetched {len(spy_data)} SPY data points")
        print(f"Date range: {spy_data.index[0].date()} to {spy_data.index[-1].date()}")
        
        # Calculate returns
        spy_data['Returns'] = spy_data['Close'].pct_change()
        spy_returns = spy_data['Returns'].dropna().tolist()
        
        print(f"Calculated {len(spy_returns)} SPY returns")
        print(f"SPY returns sample: {spy_returns[:5]}")
        print(f"SPY returns mean: {np.mean(spy_returns):.6f}")
        print(f"SPY returns variance: {np.var(spy_returns):.6f}")
        
        return {
            'returns': spy_returns,
            'dates': [d.strftime('%Y-%m-%d') for d in spy_data.index[1:]],  # Skip first date (no return)
            'prices': spy_data['Close'].tolist(),
            'mean_return': float(np.mean(spy_returns)),
            'variance': float(np.var(spy_returns)),
            'std_dev': float(np.std(spy_returns))
        }
        
    except Exception as e:
        print(f"Error fetching SPY data: {e}")
        return None

def main():
    if len(sys.argv) != 3:
        print("Usage: python fetch_spy_data.py <start_date> <end_date>")
        print("Example: python fetch_spy_data.py 2020-09-04 2025-09-02")
        sys.exit(1)
    
    start_date = sys.argv[1]
    end_date = sys.argv[2]
    
    spy_data = fetch_spy_data(start_date, end_date)
    
    if spy_data:
        # Check if output is being piped (for API usage)
        if sys.stdout.isatty():
            print("\nSPY data fetched successfully!")
            print(json.dumps(spy_data, indent=2))
        else:
            # For API usage, only output JSON
            try:
                print(json.dumps(spy_data))
            except BrokenPipeError:
                # Handle broken pipe when output is piped
                pass
    else:
        print("Failed to fetch SPY data")
        sys.exit(1)

if __name__ == "__main__":
    main()
