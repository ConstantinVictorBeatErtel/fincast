#!/usr/bin/env python3

import yfinance as yf
import json
import sys
from datetime import datetime

def fetch_spy_data(start_date, end_date):
    """
    Fetch SPY historical data using yfinance (without numpy)
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
        
        # Calculate returns without numpy
        prices = spy_data['Close'].tolist()
        returns = []
        for i in range(1, len(prices)):
            if prices[i-1] > 0:
                returns.append((prices[i] - prices[i-1]) / prices[i-1])
            else:
                returns.append(0)
        
        print(f"Calculated {len(returns)} SPY returns")
        print(f"SPY returns sample: {returns[:5]}")
        
        # Calculate statistics without numpy
        mean_return = sum(returns) / len(returns) if returns else 0
        variance = sum((r - mean_return) ** 2 for r in returns) / len(returns) if returns else 0
        std_dev = variance ** 0.5
        
        print(f"SPY returns mean: {mean_return:.6f}")
        print(f"SPY returns variance: {variance:.6f}")
        
        return {
            'returns': returns,
            'dates': [d.strftime('%Y-%m-%d') for d in spy_data.index[1:]],  # Skip first date (no return)
            'prices': prices,
            'mean_return': float(mean_return),
            'variance': float(variance),
            'std_dev': float(std_dev)
        }
        
    except Exception as e:
        print(f"Error fetching SPY data: {e}")
        return None

def main():
    if len(sys.argv) != 3:
        print("Usage: python fetch_spy_data_simple.py <start_date> <end_date>")
        print("Example: python fetch_spy_data_simple.py 2020-09-04 2025-09-02")
        sys.exit(1)
    
    start_date = sys.argv[1]
    end_date = sys.argv[2]
    
    spy_data = fetch_spy_data(start_date, end_date)
    
    if spy_data:
        print("\nSPY data fetched successfully!")
        print(json.dumps(spy_data, indent=2))
    else:
        print("Failed to fetch SPY data")
        sys.exit(1)

if __name__ == "__main__":
    main()

