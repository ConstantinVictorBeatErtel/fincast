import os
import json
import simfin as sf
import pandas as pd
import sys
from datetime import datetime

# Set your API key
sf.set_api_key('392e2398-fac4-4eba-af9e-dcda63d71d30')

# Set data directory
sf.set_data_dir('~/simfin_data/')

# Create directories for data
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
json_output_dir = os.path.join(base_dir, 'public', 'data')
os.makedirs(json_output_dir, exist_ok=True)

# Default tickers to fetch
default_tickers = ['AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'NVDA', 'JNJ', 'WMT', 'SPY']

def ensure_numeric(value):
    """Convert string numbers to float or int."""
    if isinstance(value, str):
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except ValueError:
            return value
    return value

def process_company_data(ticker):
    try:
        print(f"Processing {ticker}...")
        
        # Load financial statements
        income = sf.load_income(variant='annual', market='us')
        balance = sf.load_balance(variant='annual', market='us')
        prices = sf.load_shareprices(variant='daily', market='us')
        
        # Get latest data
        latest_income = income.loc[ticker].iloc[-1]
        latest_balance = balance.loc[ticker].iloc[-1]
        latest_price = prices.loc[ticker].iloc[-1]
        
        # Calculate metrics
        market_cap = latest_price['Close'] * latest_balance['Shares (Basic)']
        profit_margin = latest_income['Net Income'] / latest_income['Revenue']
        gross_margin = latest_income['Gross Profit'] / latest_income['Revenue']
        operating_margin = latest_income['Operating Income'] / latest_income['Revenue']
        pe_ratio = latest_price['Close'] / (latest_income['Net Income'] / latest_balance['Shares (Basic)'])
        
        # Create company metrics
        company_metrics = {
            'Symbol': ticker,
            'Revenue': ensure_numeric(latest_income['Revenue']),
            'NetIncome': ensure_numeric(latest_income['Net Income']),
            'GrossProfit': ensure_numeric(latest_income['Gross Profit']),
            'OperatingIncome': ensure_numeric(latest_income['Operating Income']),
            'TotalAssets': ensure_numeric(latest_balance['Total Assets']),
            'TotalLiabilities': ensure_numeric(latest_balance['Total Liabilities']),
            'TotalEquity': ensure_numeric(latest_balance['Total Equity']),
            'Price': ensure_numeric(latest_price['Close']),
            'Volume': ensure_numeric(latest_price['Volume']),
            'MarketCapitalization': ensure_numeric(market_cap),
            'ProfitMargin': ensure_numeric(profit_margin),
            'GrossMargin': ensure_numeric(gross_margin),
            'OperatingMargin': ensure_numeric(operating_margin),
            'PERatio': ensure_numeric(pe_ratio),
            'Date': datetime.now().strftime('%Y-%m-%d')
        }
        
        # Save metrics
        metrics_file = os.path.join(json_output_dir, f'{ticker}_metrics.json')
        with open(metrics_file, 'w') as f:
            json.dump(company_metrics, f, indent=2)
        print(f"Saved metrics for {ticker}")
        
        # Save historical prices
        historical_prices = prices.loc[ticker].reset_index()
        historical_prices['Date'] = historical_prices['Date'].dt.strftime('%Y-%m-%d')
        prices_file = os.path.join(json_output_dir, f'{ticker}_prices.json')
        with open(prices_file, 'w') as f:
            json.dump(historical_prices.to_dict(orient='records'), f, indent=2)
        print(f"Saved historical prices for {ticker}")
        
        return True
    except Exception as e:
        print(f"Error processing {ticker}: {str(e)}")
        return False

def main():
    print("Starting data fetch...")
    print(f"Data will be saved to: {json_output_dir}")
    
    # Process each ticker
    for ticker in default_tickers:
        process_company_data(ticker)
    
    print("Data fetch completed!")

if __name__ == "__main__":
    main() 

