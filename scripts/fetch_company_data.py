import sys
import os
import json
import requests
from http.server import BaseHTTPRequestHandler

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

def fetch_company_data(ticker):
    try:
        # SimFin API call
        API_KEY = 'free'  # Using free tier for testing
        url = f'https://simfin.com/api/v2/companies/find?query={ticker}&api-key={API_KEY}'
        
        # First, get the company ID
        response = requests.get(url)
        data = response.json()
        
        if not data or not data.get('data'):
            return {'error': f'Company not found for ticker {ticker}'}
            
        company_id = data['data'][0]['simId']
        
        # Then get the income statement
        url = f'https://simfin.com/api/v2/companies/id/{company_id}/statements/standardised?api-key={API_KEY}'
        response = requests.get(url)
        data = response.json()
        
        if not data or not data.get('data'):
            return {'error': f'No financial data found for ticker {ticker}'}
            
        # Get the most recent quarter's data
        latest_quarter = data['data'][0]
        
        return {
            'ticker': ticker.upper(),
            'revenue': float(latest_quarter['revenue']),
            'net_income': float(latest_quarter['netIncome']),
            'quarter': latest_quarter['period'].split('-')[1],
            'year': latest_quarter['period'].split('-')[0]
        }
    except Exception as e:
        debug_print(f"Error fetching data: {str(e)}")
        return {'error': str(e)}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            query = self.path.split('?')[1] if '?' in self.path else ''
            params = dict(param.split('=') for param in query.split('&')) if query else {}
            
            ticker = params.get('ticker')
            if not ticker:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Ticker symbol is required'}).encode())
                return

            # Fetch data
            result = fetch_company_data(ticker)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            debug_print(f"Handler error: {str(e)}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode()) 

