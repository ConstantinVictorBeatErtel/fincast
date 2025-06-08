import os
import json
import requests
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

# Alpha Vantage API key - you should replace this with your own key
API_KEY = 'demo'  # Using demo key for testing

def fetch_company_data(ticker):
    try:
        print(f"Fetching data for {ticker}...")
        
        # Fetch income statement
        url = f'https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol={ticker}&apikey={API_KEY}'
        response = requests.get(url)
        data = response.json()
        
        if 'Error Message' in data:
            return {
                'error': f'Error fetching data: {data["Error Message"]}'
            }
            
        if 'quarterlyReports' not in data or not data['quarterlyReports']:
            return {
                'error': f'No quarterly reports found for ticker {ticker}'
            }
            
        # Get the most recent quarter's data
        latest_quarter = data['quarterlyReports'][0]
        
        # Format the response
        response = {
            'ticker': ticker.upper(),
            'revenue': float(latest_quarter.get('totalRevenue', 0)),
            'net_income': float(latest_quarter.get('netIncome', 0)),
            'quarter': latest_quarter.get('fiscalDateEnding', '').split('-')[1],  # Extract quarter from date
            'year': latest_quarter.get('fiscalDateEnding', '').split('-')[0]      # Extract year from date
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

