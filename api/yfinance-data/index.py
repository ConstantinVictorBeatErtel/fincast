import json
import math
import yfinance as yf
import requests

def safe_float(value, default=0.0):
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default

def handler(request):
    try:
        ticker = request.get("query", {}).get("ticker") or request.get("body", {}).get("ticker")
        if not ticker:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing ticker"})}

        t = yf.Ticker(ticker)

        # Current price
        current_price = 0.0
        try:
            hist = yf.download(ticker, period="1mo", interval="1d", progress=False, ignore_tz=True)
            if hist is not None and not hist.empty:
                current_price = safe_float(hist['Close'].iloc[-1])
        except Exception:
            pass

        fy = {"revenue": 0, "gross_margin_pct": 0, "ebitda": 0, "net_income": 0, "eps": 0, "shares_outstanding": 0}
        market = {"current_price": current_price, "market_cap": 0, "enterprise_value": 0, "pe_ratio": 0}

        income = t.income_stmt
        cash_flow = None
        try:
            cash_flow = t.cash_flow
        except Exception:
            try:
                cash_flow = t.cashflow
            except Exception:
                cash_flow = None

        if income is not None and not income.empty and len(income.columns) > 0:
            col = income.columns[0]
            if 'Total Revenue' in income.index:
                fy["revenue"] = safe_float(income.loc['Total Revenue', col])
            if 'Gross Profit' in income.index and fy["revenue"]:
                gp = safe_float(income.loc['Gross Profit', col])
                fy["gross_margin_pct"] = (gp / fy["revenue"]) * 100 if fy["revenue"] else 0
            if 'EBITDA' in income.index:
                fy["ebitda"] = safe_float(income.loc['EBITDA', col])
            if 'Net Income' in income.index:
                fy["net_income"] = safe_float(income.loc['Net Income', col])
            if 'Diluted EPS' in income.index:
                fy["eps"] = safe_float(income.loc['Diluted EPS', col])

            # FCF latest from cash flow
            if cash_flow is not None and not cash_flow.empty and col in cash_flow.columns:
                ocf = None
                capex = None
                for ocf_label in ['Operating Cash Flow', 'Total Cash From Operating Activities', 'Cash Flow From Operating Activities']:
                    if ocf_label in cash_flow.index:
                        ocf = safe_float(cash_flow.loc[ocf_label, col])
                        break
                for capex_label in ['Capital Expenditure', 'Capital Expenditures']:
                    if capex_label in cash_flow.index:
                        capex = safe_float(cash_flow.loc[capex_label, col])
                        break
                if ocf is not None and capex is not None:
                    fcf = safe_float(ocf + capex)
                    fy["fcf"] = fcf
                    fy["fcf_margin_pct"] = (fcf / fy["revenue"]) * 100 if fy["revenue"] else 0

        info = t.info
        if info:
            market["market_cap"] = safe_float(info.get('marketCap', 0))
            market["enterprise_value"] = safe_float(info.get('enterpriseValue', 0))
            market["pe_ratio"] = safe_float(info.get('trailingPE', 0))
            if not market["current_price"]:
                market["current_price"] = safe_float(info.get('currentPrice', 0))

        result = {
            "fy24_financials": fy,
            "market_data": market,
            "company_name": info.get('longName') if info and info.get('longName') else (info.get('shortName') if info else ticker),
            "source": "yfinance",
            "currency_info": {"original_currency": info.get('currency', 'USD') if info else 'USD', "converted_to_usd": False, "conversion_rate": 1.0, "exchange_rate_source": "none"}
        }

        return {"statusCode": 200, "body": json.dumps(result)}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

import json
import yfinance as yf


def handler(request):
    """Root Python Serverless Function for Vercel at /api/yfinance-data"""
    try:
        ticker = None

        # Support multiple request styles
        if hasattr(request, 'args') and request.args:
            ticker = request.args.get('ticker')
        if not ticker and hasattr(request, 'query') and request.query:
            ticker = request.query.get('ticker')
        if not ticker and hasattr(request, 'get'):
            ticker = request.get('ticker')

        if not ticker:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Missing ticker parameter'})
            }

        company = yf.Ticker(ticker)
        info = company.info or {}

        result = {
            'ticker': ticker,
            'name': info.get('longName') or info.get('shortName') or ticker,
            'current_price': info.get('currentPrice', 0) or info.get('regularMarketPrice', 0) or 0,
            'market_cap': info.get('marketCap', 0) or 0,
            'currency': info.get('currency', 'USD') or 'USD',
            'source': 'yfinance',
        }

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(result)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e), 'type': type(e).__name__})
        }


