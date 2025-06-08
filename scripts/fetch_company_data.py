import os
import json
import simfin as sf
import pandas as pd
import numpy as np
import sys
from datetime import datetime

print("Current working directory:", os.getcwd())
print("Script location:", os.path.abspath(__file__))
print("Directory contents:", os.listdir('.'))

# Set data directory based on environment
if os.environ.get('VERCEL'):
    # In Vercel environment
    data_dir = '/tmp/simfin_data'
    json_output_dir = '/tmp/data'
else:
    # Local development
    data_dir = os.path.expanduser('~/simfin_data')
    json_output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'data')

# Create directories if they don't exist
os.makedirs(data_dir, exist_ok=True)
os.makedirs(json_output_dir, exist_ok=True)

# Set API key and data directory
API_KEY = '392e2398-fac4-4eba-af9e-dcda63d71d30'
sf.set_api_key(API_KEY)
sf.set_data_dir(data_dir)

# Default tickers to fetch
default_tickers = ['AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'NVDA', 'JNJ', 'WMT', 'SPY']

def ensure_numeric(value):
    """Convert numpy/pandas types to Python native types."""
    if isinstance(value, (np.integer, np.int64)):
        return int(value)
    elif isinstance(value, (np.floating, np.float64)):
        return float(value)
    elif isinstance(value, str):
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except ValueError:
            return value
    return value

def safe_get(data, key, default=0):
    """Safely get a value from a pandas Series."""
    try:
        return data.get(key, default)
    except:
        return default

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
        market_cap = latest_price['Close'] * safe_get(latest_balance, 'Shares (Basic)', 0)
        revenue = safe_get(latest_income, 'Revenue', 0)
        net_income = safe_get(latest_income, 'Net Income', 0)
        gross_profit = safe_get(latest_income, 'Gross Profit', 0)
        operating_income = safe_get(latest_income, 'Operating Income', 0)
        
        profit_margin = net_income / revenue if revenue else 0
        gross_margin = gross_profit / revenue if revenue else 0
        operating_margin = operating_income / revenue if revenue else 0
        pe_ratio = latest_price['Close'] / (net_income / safe_get(latest_balance, 'Shares (Basic)', 1)) if net_income else 0
        
        # Create company metrics
        company_metrics = {
            'Symbol': ticker,
            'Revenue': ensure_numeric(revenue),
            'NetIncome': ensure_numeric(net_income),
            'GrossProfit': ensure_numeric(gross_profit),
            'OperatingIncome': ensure_numeric(operating_income),
            'TotalAssets': ensure_numeric(safe_get(latest_balance, 'Total Assets', 0)),
            'TotalLiabilities': ensure_numeric(safe_get(latest_balance, 'Total Liabilities', 0)),
            'TotalEquity': ensure_numeric(safe_get(latest_balance, 'Total Equity', 0)),
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
        historical_prices = historical_prices.applymap(ensure_numeric)
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

def fetch_company_data(ticker):
    try:
        print(f"Fetching data for {ticker}...")
        print(f"Using data directory: {data_dir}")
        
        # Download fresh data
        sf.download(dataset='income', variant='quarterly', market='us')
        
        # Load income statement data
        income = sf.load_income(variant='quarterly', market='us')
        print(f"Loaded income data. Shape: {income.shape}")
        
        # Filter for the specific company
        company_data = income[income['Ticker'] == ticker.upper()]
        print(f"Found {len(company_data)} records for {ticker}")
        
        if company_data.empty:
            return {
                'error': f'No data found for ticker {ticker}'
            }

        # Get the most recent quarter's data
        latest_data = company_data.iloc[0]
        print(f"Latest data: {latest_data.to_dict()}")
        
        # Format the response
        response = {
            'ticker': ticker.upper(),
            'revenue': float(latest_data['Revenue']),
            'net_income': float(latest_data['Net Income']),
            'quarter': latest_data.name[1],  # The quarter from the MultiIndex
            'year': latest_data.name[0]      # The year from the MultiIndex
        }
        
        print(f"Returning response: {response}")
        return response

    except Exception as e:
        print(f"Error in fetch_company_data: {str(e)}")
        return {
            'error': f'Error fetching data: {str(e)}'
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Please provide a ticker symbol'}))
        sys.exit(1)
    
    ticker = sys.argv[1]
    result = fetch_company_data(ticker)
    print(json.dumps(result)) 

