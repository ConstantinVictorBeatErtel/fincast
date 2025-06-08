import sys
import os
import json
import requests
import time
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

# Cache for storing API responses
cache = {}
CACHE_DURATION = 3600  # Cache for 1 hour

def fetch_company_data(ticker):
    try:
        # Check cache first
        cache_key = f"company_data_{ticker}"
        if cache_key in cache:
            cache_entry = cache[cache_key]
            if time.time() - cache_entry['timestamp'] < CACHE_DURATION:
                debug_print(f"Returning cached data for {ticker}")
                return cache_entry['data']

        # SimFin API call with timeout
        API_KEY = 'free'  # Using free tier for testing
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        }
        
        # First, get the company ID
        url = f'https://simfin.com/api/v2/companies/find?query={ticker}&api-key={API_KEY}'
        debug_print(f"Fetching company ID from: {url}")
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()  # Raise exception for bad status codes
        data = response.json()
        
        if not data or not data.get('data'):
            error_msg = f'Company not found for ticker {ticker}'
            debug_print(error_msg)
            return {'error': error_msg}
            
        company_id = data['data'][0]['simId']
        debug_print(f"Found company ID: {company_id}")
        
        # Then get the income statement
        url = f'https://simfin.com/api/v2/companies/id/{company_id}/statements/standardised?api-key={API_KEY}'
        debug_print(f"Fetching financial data from: {url}")
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data or not data.get('data'):
            error_msg = f'No financial data found for ticker {ticker}'
            debug_print(error_msg)
            return {'error': error_msg}
            
        # Get the most recent quarter's data
        latest_quarter = data['data'][0]
        
        result = {
            'ticker': ticker.upper(),
            'revenue': float(latest_quarter['revenue']),
            'net_income': float(latest_quarter['netIncome']),
            'quarter': latest_quarter['period'].split('-')[1],
            'year': latest_quarter['period'].split('-')[0]
        }
        
        # Cache the result
        cache[cache_key] = {
            'data': result,
            'timestamp': time.time()
        }
        
        debug_print(f"Successfully fetched data for {ticker}")
        return result
        
    except requests.Timeout:
        error_msg = f'Request timed out for ticker {ticker}'
        debug_print(error_msg)
        return {'error': error_msg}
    except requests.RequestException as e:
        error_msg = f'API request failed: {str(e)}'
        debug_print(error_msg)
        return {'error': error_msg}
    except Exception as e:
        error_msg = f'Error fetching data: {str(e)}'
        debug_print(error_msg)
        return {'error': error_msg}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            ticker = query_params.get('ticker', [''])[0]
            
            if not ticker:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Ticker symbol is required'}).encode())
                return

            # Fetch data
            result = fetch_company_data(ticker)
            
            # Send response
            status = 200 if 'error' not in result else 400
            self.send_response(status)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            debug_print(f"Handler error: {str(e)}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode()) 

