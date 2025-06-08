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
        # Alpha Vantage API call
        API_KEY = 'P7M6C5PE71GNLCKN'
        url = f'https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol={ticker}&apikey={API_KEY}'
        
        response = requests.get(url)
        data = response.json()

        if 'Error Message' in data:
            return {'error': data['Error Message']}

        if not data.get('quarterlyReports'):
            return {'error': f'No quarterly reports found for ticker {ticker}'}

        # Get the most recent quarter's data
        latest_quarter = data['quarterlyReports'][0]
        fiscal_date = latest_quarter['fiscalDateEnding'].split('-')
        
        return {
            'ticker': ticker.upper(),
            'revenue': float(latest_quarter['totalRevenue']),
            'net_income': float(latest_quarter['netIncome']),
            'quarter': fiscal_date[1],
            'year': fiscal_date[0]
        }
    except Exception as e:
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
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode()) 

