import json
import math
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
except Exception:
    yf = None
    pd = None
    np = None


def _safe_float(value, default=0.0):
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default


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
        
        # Fetch SPY data
        spy = yf.Ticker("SPY")
        spy_data = spy.history(start=start_date, end=end_date)
        
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

    t = yf.Ticker(ticker)

    info = {}
    try:
        info = t.info or {}
    except Exception:
        info = {}

    current_price = 0
    try:
        hist = yf.download(ticker, period="1mo", interval="1d", progress=False, ignore_tz=True)
        if hist is not None and not hist.empty:
            current_price = _safe_float(hist['Close'].iloc[-1])
    except Exception:
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
        is_df = t.income_stmt
        try:
            cf_df = t.cash_flow
        except Exception:
            try:
                cf_df = t.cashflow
            except Exception:
                cf_df = None

        # Try to get balance sheet
        bs_df = None
        try:
            bs_df = t.balance_sheet
        except Exception:
            try:
                bs_df = t.balancesheet
            except Exception:
                bs_df = None

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

                # Calculate ROIC from balance sheet data
                roic = 0.0
                try:
                    if bs_df is not None and not bs_df.empty and col in bs_df.columns:
                        total_equity = None
                        total_debt = None
                        cash = None

                        # Try to get stockholder equity
                        for equity_label in ['Stockholders Equity', 'Total Equity', 'Stockholders\' Equity', 'Total Stockholder Equity']:
                            if equity_label in bs_df.index:
                                total_equity = _safe_float(bs_df.loc[equity_label, col])
                                break

                        # Try to get total debt
                        for debt_label in ['Total Debt', 'Long Term Debt', 'Net Debt']:
                            if debt_label in bs_df.index:
                                total_debt = _safe_float(bs_df.loc[debt_label, col])
                                break

                        # Try to get cash
                        for cash_label in ['Cash And Cash Equivalents', 'Cash', 'Cash Cash Equivalents And Short Term Investments']:
                            if cash_label in bs_df.index:
                                cash = _safe_float(bs_df.loc[cash_label, col])
                                break

                        # Calculate invested capital
                        if total_equity is not None:
                            invested_capital = total_equity
                            if total_debt is not None:
                                invested_capital += total_debt
                            if cash is not None:
                                invested_capital -= cash

                            if invested_capital > 0 and ni > 0:
                                roic = (ni / invested_capital) * 100.0
                except Exception:
                    pass

                # Calculate valuation metrics
                pe_ratio = 0.0
                ev_ebitda = 0.0
                ps_ratio = 0.0

                try:
                    if year_num:
                        # Try to get price data around fiscal year end
                        try:
                            hist_prices = yf.download(ticker, start=f"{year_num}-11-01", end=f"{year_num+1}-01-31", progress=False, ignore_tz=True)
                            if hist_prices is not None and not hist_prices.empty:
                                historical_price = _safe_float(hist_prices['Close'].iloc[-1])

                                # Get shares outstanding for this period
                                shares_outstanding = None
                                if 'Diluted Average Shares' in is_df.index and col in is_df.columns:
                                    shares_outstanding = _safe_float(is_df.loc['Diluted Average Shares', col])

                                if shares_outstanding and shares_outstanding > 0:
                                    historical_market_cap = historical_price * shares_outstanding

                                    # Calculate P/E
                                    if ni > 0:
                                        pe_ratio = historical_market_cap / ni

                                    # Calculate P/S
                                    if rev > 0:
                                        ps_ratio = historical_market_cap / rev

                                    # Calculate EV/EBITDA
                                    if ebitda > 0:
                                        ev = historical_market_cap
                                        if bs_df is not None and not bs_df.empty and col in bs_df.columns:
                                            debt = None
                                            cash_bs = None
                                            for debt_label in ['Total Debt', 'Long Term Debt']:
                                                if debt_label in bs_df.index:
                                                    debt = _safe_float(bs_df.loc[debt_label, col])
                                                    break
                                            for cash_label in ['Cash And Cash Equivalents', 'Cash', 'Cash Cash Equivalents And Short Term Investments']:
                                                if cash_label in bs_df.index:
                                                    cash_bs = _safe_float(bs_df.loc[cash_label, col])
                                                    break

                                            if debt is not None:
                                                ev += debt
                                            if cash_bs is not None:
                                                ev -= cash_bs

                                        ev_ebitda = ev / ebitda
                        except Exception:
                            pass
                except Exception:
                    pass

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
                    "roic": roic,
                    "peRatio": pe_ratio,
                    "evEbitda": ev_ebitda,
                    "psRatio": ps_ratio,
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
    except Exception:
        pass

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
            err = json.dumps({'error': str(e)}).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(err)))
            self.end_headers()
            self.wfile.write(err)


