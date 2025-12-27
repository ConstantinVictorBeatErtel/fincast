"""
Vercel serverless function for yfinance data fetching.
This wraps the existing fetch_yfinance.py script.
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import sys
import json
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.fetch_yfinance import fetch_financials, fetch_historical_valuation


class handler(BaseHTTPRequestHandler):
    """Vercel serverless function handler using BaseHTTPRequestHandler."""

    def do_GET(self):
        try:
            # Parse query parameters
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)

            # Get ticker from query params
            ticker = query_params.get('ticker', [None])[0]

            if not ticker:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Ticker parameter is required'
                }).encode())
                return

            # Get mode from query params
            mode = query_params.get('mode', [None])[0]
            
            # Fetch the data based on mode
            if mode == 'valuation':
                data = fetch_historical_valuation(ticker)
            else:
                data = fetch_financials(ticker)

            # Send successful response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': 'Failed to fetch data',
                'message': str(e),
                'traceback': error_details
            }).encode())
