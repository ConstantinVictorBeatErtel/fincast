from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Add the virtual environment's site-packages to the Python path
venv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'venv')
site_packages = os.path.join(venv_path, 'lib', 'python3.12', 'site-packages')
if os.path.exists(site_packages):
    sys.path.insert(0, site_packages)

# Now import simfin
import simfin as sf
from simfin.names import *

# Set your API-key for downloading data.
sf.set_api_key('1aab9692-30b6-4b82-be79-27d454de3b25')

# Set the local directory where data-files are stored.
data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
os.makedirs(data_dir, exist_ok=True)
sf.set_data_dir(data_dir)

def fetch_company_data(ticker):
    try:
        # Load the annual Income Statements for all companies in the US.
        df = sf.load_income(variant='annual', market='us')

        # Get data for the specified ticker
        data = df.loc[ticker, [REVENUE, NET_INCOME]]
        result = {}
        for idx, row in data.iterrows():
            result[str(idx)] = {
                'Revenue': float(row[REVENUE]),
                'Net Income': float(row[NET_INCOME])
            }

        return result
    except Exception as e:
        return {'error': str(e)}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Get ticker from query string
        query = self.path.split('?')[1] if '?' in self.path else ''
        params = dict(param.split('=') for param in query.split('&') if param)
        ticker = params.get('ticker', '')

        if not ticker:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Ticker is required'}).encode())
            return

        try:
            data = fetch_company_data(ticker)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode()) 