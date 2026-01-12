"""
Vercel serverless function for fetching historical price data for portfolio analysis.
Returns 5 years of daily prices for given tickers.
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import yfinance as yf
from datetime import datetime, timedelta


class handler(BaseHTTPRequestHandler):
    """Vercel serverless function handler for portfolio price data."""

    def do_POST(self):
        try:
            # Read POST body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body)

            # Get tickers from request body
            tickers = data.get('tickers', [])

            if not tickers or not isinstance(tickers, list):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'error': 'Tickers array is required'
                }).encode())
                return

            # Fetch 5 years of historical data
            end_date = datetime.now()
            start_date = end_date - timedelta(days=5*365)

            result = {}

            for ticker in tickers:
                try:
                    # Download historical data
                    hist = yf.download(
                        ticker,
                        start=start_date,
                        end=end_date,
                        interval='1d',
                        progress=False,
                        auto_adjust=True
                    )

                    if hist is not None and not hist.empty:
                        # Convert to list of daily prices
                        prices = []
                        for date, row in hist.iterrows():
                            prices.append({
                                'date': date.strftime('%Y-%m-%d'),
                                'close': float(row['Close']),
                                'volume': int(row['Volume']) if 'Volume' in row else 0
                            })
                        
                        result[ticker] = prices
                    else:
                        result[ticker] = []

                except Exception as e:
                    print(f"Error fetching data for {ticker}: {e}")
                    result[ticker] = []

            # Send successful response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'error': 'Failed to fetch price data',
                'message': str(e)
            }).encode())
