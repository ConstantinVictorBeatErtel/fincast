"""
Vercel serverless function for fetching historical price data for portfolio analysis.
Returns 5 years of daily prices for given tickers.
"""
from http.server import BaseHTTPRequestHandler
import json
import yfinance as yf
import pandas as pd
import sys
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
            
            try:
                # Use bulk download for efficiency
                # Always use group_by='ticker' for consistency
                hist_data = yf.download(
                    tickers,
                    start=start_date,
                    end=end_date,
                    interval='1d',
                    progress=False,
                    auto_adjust=True,
                    group_by='ticker'
                )
                
                if hist_data.empty:
                     for t in tickers:
                         result[t] = []
                else:
                    for ticker in tickers:
                        prices = []
                        try:
                            df = None
                            # Handle MultiIndex logic
                            if isinstance(hist_data.columns, pd.MultiIndex):
                                try:
                                    df = hist_data[ticker]
                                except KeyError:
                                    df = None
                            else:
                                # Flat index logic
                                if len(tickers) == 1 and tickers[0] == ticker:
                                    df = hist_data
                                else:
                                    df = hist_data

                            if df is not None and not df.empty:
                                if 'Close' in df.columns:
                                    for index, row in df.iterrows():
                                        try:
                                            # Handle potential NaN
                                            close_val = float(row['Close'])
                                            if str(close_val) != 'nan':
                                                prices.append({
                                                    'date': index.strftime('%Y-%m-%d'),
                                                    'close': close_val
                                                })
                                        except:
                                            pass
                                result[ticker] = prices
                            else:
                                result[ticker] = []

                        except Exception as inner_e:
                            print(f"Error processing {ticker}: {inner_e}")
                            result[ticker] = []
                            
            except Exception as e:
                print(f"Bulk download failed: {e}")
                # Fallback to one-by-one
                for ticker in tickers:
                    try:
                        hist = yf.Ticker(ticker).history(start=start_date, end=end_date, interval='1d', auto_adjust=True)
                        prices = []
                        if not hist.empty and 'Close' in hist.columns:
                             for index, row in hist.iterrows():
                                prices.append({
                                    'date': index.strftime('%Y-%m-%d'),
                                    'close': float(row['Close'])
                                })
                        result[ticker] = prices
                    except Exception as e2:
                        print(f"Fallback failed for {ticker}: {e2}")
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
