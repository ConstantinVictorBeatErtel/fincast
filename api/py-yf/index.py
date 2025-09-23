import json
import math
import os
import urllib.parse
import time
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
    import requests

    # Configure session with better headers and timeout
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })

    # Set global yfinance session
    yf.utils.get_json = lambda url, proxy=None, session=session: session.get(url, proxies=proxy, timeout=30).json()

except Exception as e:
    print(f"Import error: {str(e)}")
    yf = None
    pd = None
    np = None
    session = None


def _safe_float(value, default=0.0):
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default


def _retry_yfinance_call(func, max_retries=3, delay=1):
    """Retry yfinance calls with exponential backoff to handle rate limiting"""
    for attempt in range(max_retries):
        try:
            result = func()
            return result
        except Exception as e:
            error_msg = str(e).lower()
            if '429' in error_msg or 'too many requests' in error_msg or 'rate limit' in error_msg:
                if attempt < max_retries - 1:
                    wait_time = delay * (2 ** attempt)  # Exponential backoff
                    print(f"Rate limited, waiting {wait_time}s before retry {attempt + 1}/{max_retries}")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"Max retries exceeded due to rate limiting: {str(e)}")
                    raise
            else:
                print(f"Non-rate-limit error: {str(e)}")
                raise
    return None


def _fetch_spy_data(start_date, end_date):
    """
    Fetch SPY historical data using yfinance
    """
    if yf is None or pd is None or np is None:
        return 500, {"error": "Required libraries not available"}
    
    try:
        # Convert string dates to datetime objects if needed
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d')
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d')

        # Fetch SPY data with retry mechanism
        def get_spy_data():
            spy = yf.Ticker("SPY")
            return spy.history(start=start_date, end=end_date)

        spy_data = _retry_yfinance_call(get_spy_data)
        if spy_data is None:
            return 500, {"error": "Failed to fetch SPY data after retries"}
        
        if spy_data.empty:
            return 404, {"error": "No SPY data found for the given date range"}
        
        # Calculate returns
        spy_data['Returns'] = spy_data['Close'].pct_change()
        spy_returns = spy_data['Returns'].dropna().tolist()
        
        return 200, {
            'returns': spy_returns,
            'dates': [d.strftime('%Y-%m-%d') for d in spy_data.index[1:]],  # Skip first date (no return)
            'prices': spy_data['Close'].tolist(),
            'mean_return': float(np.mean(spy_returns)),
            'variance': float(np.var(spy_returns)),
            'std_dev': float(np.std(spy_returns)),
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'data_points': len(spy_returns)
        }
        
    except Exception as e:
        return 500, {"error": f"Error fetching SPY data: {str(e)}"}


def _fetch_ticker_payload(ticker: str):
    if not ticker:
        return 400, {"error": "Missing ticker parameter"}
    if yf is None:
        return 500, {"error": "yfinance not available in this runtime"}

    try:
        t = _retry_yfinance_call(lambda: yf.Ticker(ticker))
        if t is None:
            return 500, {"error": "Failed to create yfinance Ticker after retries"}
    except Exception as e:
        return 500, {"error": f"Failed to create yfinance Ticker: {str(e)}"}

    info = {}
    try:
        info = _retry_yfinance_call(lambda: t.info or {})
        if info is None:
            info = {}
    except Exception as e:
        print(f"Warning: Failed to get ticker info for {ticker}: {str(e)}")
        info = {}

    current_price = 0
    try:
        def get_price_history():
            hist = yf.download(ticker, period="1mo", interval="1d", progress=False, ignore_tz=True)
            if hist is not None and not hist.empty:
                return _safe_float(hist['Close'].iloc[-1])
            return 0

        current_price = _retry_yfinance_call(get_price_history) or 0
    except Exception as e:
        print(f"Warning: Failed to get price history for {ticker}: {str(e)}")
        pass

    fy_data = {
        "revenue": 0,
        "gross_profit": 0,
        "gross_margin_pct": 0,
        "ebitda": 0,
        "ebitda_margin_pct": 0,
        "net_income": 0,
        "eps": 0,
        "shares_outstanding": 0,
        "fcf": 0,
        "fcf_margin_pct": 0,
    }

    historical = []

    try:
        def get_financial_statements():
            is_df = t.income_stmt
            cf_df = None
            try:
                cf_df = t.cash_flow
            except Exception:
                try:
                    cf_df = t.cashflow
                except Exception as e:
                    print(f"Warning: Failed to get cash flow data for {ticker}: {str(e)}")
                    cf_df = None
            return is_df, cf_df

        financial_data = _retry_yfinance_call(get_financial_statements)
        if financial_data:
            is_df, cf_df = financial_data
        else:
            print(f"Warning: Failed to get financial statements for {ticker} after retries")
            is_df, cf_df = None, None

        if is_df is not None and not is_df.empty:
            cols = list(is_df.columns)[:4]
            cols_rev = cols[::-1]
            prev_rev_m = None
            for col in cols_rev:
                year_label = str(col)
                year_num = None
                try:
                    year_num = int(str(col)[:4])
                except Exception:
                    pass
                fy_label = f"FY{str(year_num)[-2:]}" if year_num else f"FY{year_label}"

                rev = _safe_float(is_df.loc['Total Revenue', col]) if 'Total Revenue' in is_df.index else 0
                gp = _safe_float(is_df.loc['Gross Profit', col]) if 'Gross Profit' in is_df.index else 0
                ebitda = _safe_float(is_df.loc['EBITDA', col]) if 'EBITDA' in is_df.index else 0
                ni = _safe_float(is_df.loc['Net Income', col]) if 'Net Income' in is_df.index else 0
                eps = _safe_float(is_df.loc['Diluted EPS', col]) if 'Diluted EPS' in is_df.index else 0

                ocf = None
                capex = None
                if cf_df is not None and not cf_df.empty and col in cf_df.columns:
                    for ocf_label in ['Operating Cash Flow', 'Total Cash From Operating Activities', 'Cash Flow From Operating Activities']:
                        if ocf_label in cf_df.index:
                            ocf = _safe_float(cf_df.loc[ocf_label, col])
                            break
                    for capex_label in ['Capital Expenditure', 'Capital Expenditures']:
                        if capex_label in cf_df.index:
                            capex = _safe_float(cf_df.loc[capex_label, col])
                            break
                if ocf is None or capex is None:
                    fcf_val = rev * 0.25
                else:
                    fcf_val = ocf + capex

                rev_m = rev / 1_000_000.0
                gp_m = gp / 1_000_000.0
                ebitda_m = ebitda / 1_000_000.0
                ni_m = ni / 1_000_000.0
                fcf_m = fcf_val / 1_000_000.0

                gm = (gp / rev * 100.0) if rev else 0.0
                em = (ebitda / rev * 100.0) if rev else 0.0
                nim = (ni / rev * 100.0) if rev else 0.0
                fcfm = (fcf_val / rev * 100.0) if rev else 0.0

                if prev_rev_m is not None and prev_rev_m > 0:
                    rev_g = ((rev_m - prev_rev_m) / prev_rev_m) * 100.0
                else:
                    rev_g = None
                prev_rev_m = rev_m

                historical.append({
                    "year": fy_label,
                    "revenue": rev_m,
                    "revenueGrowth": rev_g,
                    "grossProfit": gp_m,
                    "grossMargin": gm,
                    "ebitda": ebitda_m,
                    "ebitdaMargin": em,
                    "fcf": fcf_m,
                    "fcfMargin": fcfm,
                    "netIncome": ni_m,
                    "netIncomeMargin": nim,
                    "eps": eps,
                })

            latest_col = cols[0]
            fy_data["revenue"] = _safe_float(is_df.loc['Total Revenue', latest_col]) if 'Total Revenue' in is_df.index else 0
            fy_data["gross_profit"] = _safe_float(is_df.loc['Gross Profit', latest_col]) if 'Gross Profit' in is_df.index else 0
            fy_data["ebitda"] = _safe_float(is_df.loc['EBITDA', latest_col]) if 'EBITDA' in is_df.index else 0
            fy_data["net_income"] = _safe_float(is_df.loc['Net Income', latest_col]) if 'Net Income' in is_df.index else 0
            fy_data["eps"] = _safe_float(is_df.loc['Diluted EPS', latest_col]) if 'Diluted EPS' in is_df.index else 0
            if fy_data["revenue"]:
                fy_data["gross_margin_pct"] = (fy_data["gross_profit"] / fy_data["revenue"]) * 100.0
                fy_data["ebitda_margin_pct"] = (fy_data["ebitda"] / fy_data["revenue"]) * 100.0

            fcf_latest = None
            if cf_df is not None and not cf_df.empty and latest_col in cf_df.columns:
                ocf = None
                capex = None
                for ocf_label in ['Operating Cash Flow', 'Total Cash From Operating Activities', 'Cash Flow From Operating Activities']:
                    if ocf_label in cf_df.index:
                        ocf = _safe_float(cf_df.loc[ocf_label, latest_col])
                        break
                for capex_label in ['Capital Expenditure', 'Capital Expenditures']:
                    if capex_label in cf_df.index:
                        capex = _safe_float(cf_df.loc[capex_label, latest_col])
                        break
                if ocf is not None and capex is not None:
                    fcf_latest = ocf + capex
            if fcf_latest is None:
                fcf_latest = fy_data["revenue"] * 0.25
            fy_data["fcf"] = fcf_latest
            if fy_data["revenue"]:
                fy_data["fcf_margin_pct"] = (fcf_latest / fy_data["revenue"]) * 100.0
    except Exception as e:
        print(f"Warning: Failed to process financial statements for {ticker}: {str(e)}")
        # Ensure we still have basic structure even if data processing fails
        historical = []

    company_name = info.get('longName') or info.get('shortName') or ticker
    shares_outstanding = _safe_float(info.get('sharesOutstanding', 0))
    fy_data["shares_outstanding"] = shares_outstanding

    market_data = {
        "current_price": current_price or _safe_float(info.get('currentPrice', 0)),
        "market_cap": _safe_float(info.get('marketCap', 0)),
        "enterprise_value": _safe_float(info.get('enterpriseValue', 0)),
        "pe_ratio": _safe_float(info.get('trailingPE', 0)),
    }

    result = {
        "fy24_financials": fy_data,
        "market_data": market_data,
        "company_name": company_name,
        "source": "yfinance",
        "currency_info": {
            "original_currency": info.get('currency', 'USD'),
            "converted_to_usd": False,
            "conversion_rate": 1.0,
            "exchange_rate_source": "none",
        },
        "historical_financials": historical,
    }
    return 200, result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            
            # Check if this is a SPY data request
            ticker = (qs.get('ticker') or [None])[0]
            if ticker and ticker.upper() == 'SPY':
                start_date = (qs.get('start_date') or [None])[0]
                end_date = (qs.get('end_date') or [None])[0]
                
                # Default to 5 years if no dates provided
                if not start_date or not end_date:
                    end_date = datetime.now()
                    start_date = end_date - timedelta(days=5*365)
                    start_date = start_date.strftime('%Y-%m-%d')
                    end_date = end_date.strftime('%Y-%m-%d')
                
                status, payload = _fetch_spy_data(start_date, end_date)
            else:
                # Regular ticker data request
                ticker = (qs.get('ticker') or [None])[0]
                status, payload = _fetch_ticker_payload((ticker or '').upper())

            body = json.dumps(payload, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            error_msg = f"Error in py-yf handler: {str(e)}"
            print(error_msg)
            err = json.dumps({'error': error_msg}).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(err)))
            self.end_headers()
            self.wfile.write(err)


