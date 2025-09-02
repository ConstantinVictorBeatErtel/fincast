import json
import math
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler

try:
    import yfinance as yf
except Exception:
    yf = None


def _safe_float(value, default=0.0):
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default


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


