import os
import json
import yfinance as yf
import pandas as pd
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

def fetch_company_data(ticker):
    try:
        print(f"Fetching data for {ticker}...")
        
        # Create a Ticker object
        stock = yf.Ticker(ticker)
        
        # Get financial data
        financials = stock.financials
        if financials.empty:
            return {
                'error': f'No financial data found for ticker {ticker}'
            }
            
        # Get the most recent quarter's data
        latest_quarter = financials.iloc[:, 0]  # First column is the most recent quarter
        
        # Get income statement
        income_stmt = stock.income_stmt
        if income_stmt.empty:
            return {
                'error': f'No income statement data found for ticker {ticker}'
            }
            
        latest_income = income_stmt.iloc[:, 0]  # First column is the most recent quarter
        
        # Format the response
        response = {
            'ticker': ticker.upper(),
            'revenue': float(latest_income.get('Total Revenue', 0)),
            'net_income': float(latest_income.get('Net Income', 0)),
            'quarter': latest_income.name.strftime('%Q'),  # Quarter number
            'year': latest_income.name.strftime('%Y')      # Year
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

