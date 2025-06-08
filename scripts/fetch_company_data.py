import os
import json
import requests
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Debug information goes to stderr
def debug_print(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

debug_print("Current working directory:", os.getcwd())
debug_print("Script location:", os.path.abspath(__file__))
debug_print("Directory contents:", os.listdir('.'))

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

# Alpha Vantage API key
API_KEY = 'P7M6C5PE71GNLCKN'

def fetch_company_data(ticker):
    try:
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
        
        return response

    except Exception as e:
        return {
            'error': f'Error fetching data: {str(e)}'
        }

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse query parameters
        query = parse_qs(urlparse(self.path).query)
        ticker = query.get('ticker', [''])[0]

        if not ticker:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Ticker symbol is required'}).encode())
            return

        # Fetch company data
        result = fetch_company_data(ticker)

        # Send response
        self.send_response(200 if 'error' not in result else 404)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode()) 

