from http.server import BaseHTTPRequestHandler
import json
import sys
import os

# Add the scripts directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'scripts'))

from fetch_yfinance import fetch_financials

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(self.path)
            params = parse_qs(parsed_url.query)
            
            ticker = params.get('ticker', [None])[0]
            
            if not ticker:
                self.send_error(400, "Missing ticker parameter")
                return
            
            # Fetch data using existing Python function
            result = fetch_financials(ticker)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            error_response = {
                'error': str(e),
                'type': type(e).__name__
            }
            self.wfile.write(json.dumps(error_response).encode())
