#!/usr/bin/env python3
"""
Python script to fetch yfinance data for a given ticker.
Called from Node.js to get real financial data.
"""
import sys
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


def get_exchange_rate(from_currency, to_currency='USD'):
    """Get exchange rate from a free API."""
    if from_currency == to_currency:
        return 1.0
    
    try:
        # Using a free exchange rate API
        url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return data['rates'].get(to_currency, 1.0)
        else:
            # Fallback to approximate rates for common currencies
            fallback_rates = {
                'EUR': 1.08, 'GBP': 1.27, 'CAD': 0.74, 'AUD': 0.66,
                'JPY': 0.0067, 'CHF': 1.12, 'CNY': 0.14, 'INR': 0.012,
                'BRL': 0.21, 'MXN': 0.059, 'KRW': 0.00076, 'SGD': 0.74,
                'HKD': 0.13, 'SEK': 0.095, 'NOK': 0.095, 'DKK': 0.14,
                'PLN': 0.25, 'CZK': 0.044, 'HUF': 0.0028, 'RUB': 0.011
            }
            return fallback_rates.get(from_currency, 1.0)
    except Exception:
        # Return fallback rate if API fails
        fallback_rates = {
            'EUR': 1.08, 'GBP': 1.27, 'CAD': 0.74, 'AUD': 0.66,
            'JPY': 0.0067, 'CHF': 1.12, 'CNY': 0.14, 'INR': 0.012,
            'BRL': 0.21, 'MXN': 0.059, 'KRW': 0.00076, 'SGD': 0.74,
            'HKD': 0.13, 'SEK': 0.095, 'NOK': 0.095, 'DKK': 0.14,
            'PLN': 0.25, 'CZK': 0.044, 'HUF': 0.0028, 'RUB': 0.011
        }
        return fallback_rates.get(from_currency, 1.0)


def convert_currency(value, from_currency, to_currency='USD'):
    """Convert a value from one currency to another."""
    if from_currency == to_currency:
        return value
    
    rate = get_exchange_rate(from_currency, to_currency)
    return value * rate


def fetch_financials(ticker):
    """Fetch financial data from yfinance for a given ticker."""
    try:
        company = yf.Ticker(ticker)
        annual_income = company.income_stmt
        if annual_income is None or annual_income.empty:
            return None
        
        latest_year = annual_income.columns[0]
        # Try to obtain cash flow statement for FCF
        cashflow = getattr(company, 'cashflow', None)
        if cashflow is None or cashflow.empty:
            cashflow = getattr(company, 'cash_flow', None)

        def get_row(df, names, col):
            if df is None or df.empty:
                return 0.0
            for name in names:
                if name in df.index:
                    try:
                        return safe_float(df.loc[name, col])
                    except Exception:
                        continue
            return 0.0
        
        # Get company info for currency detection
        info = company.info or {}
        
        # Enhanced currency detection - check multiple sources
        currency = info.get('currency', 'USD')
        if not currency or currency == 'None':
            currency = 'USD'
        
        # Additional currency detection logic for known non-US companies
        company_name = info.get('longName', '').lower()
        country = info.get('country', '').lower()
        
        # Known European companies that often report in local currency
        european_currencies = {
            'novo nordisk': 'DKK',
            'roche': 'CHF',
            'sanofi': 'EUR',
            'astrazeneca': 'GBP',
            'glaxosmithkline': 'GBP',
            'bayer': 'EUR',
            'basf': 'EUR',
            'sap': 'EUR',
            'siemens': 'EUR',
            'volkswagen': 'EUR',
            'bmw': 'EUR',
            'daimler': 'EUR',
            'nestle': 'CHF',
            'novartis': 'CHF',
            'ubs': 'CHF',
            'credit suisse': 'CHF',
            'deutsche bank': 'EUR',
            'bnp paribas': 'EUR',
            'societe generale': 'EUR',
            'ing group': 'EUR',
            'unilever': 'EUR',
            'anheuser-busch': 'EUR',
            'philips': 'EUR',
            'asml': 'EUR',
            'shell': 'EUR',
            'bp': 'GBP',
            'total': 'EUR',
            'eni': 'EUR',
            'repsol': 'EUR'
        }
        
        # Check if this is a known European company - use word boundaries to avoid false matches
        for company_key, expected_currency in european_currencies.items():
            # Use word boundaries to avoid matching "ing" in "holdings"
            if f" {company_key} " in f" {company_name} " or company_name.startswith(f"{company_key} ") or company_name.endswith(f" {company_key}"):
                currency = expected_currency
                break
        
        # Additional checks for country-based currency
        if country and currency == 'USD':
            country_currencies = {
                'denmark': 'DKK',
                'sweden': 'SEK',
                'norway': 'NOK',
                'switzerland': 'CHF',
                'germany': 'EUR',
                'france': 'EUR',
                'italy': 'EUR',
                'spain': 'EUR',
                'netherlands': 'EUR',
                'belgium': 'EUR',
                'austria': 'EUR',
                'finland': 'EUR',
                'ireland': 'EUR',
                'portugal': 'EUR',
                'greece': 'EUR',
                'united kingdom': 'GBP',
                'japan': 'JPY',
                'canada': 'CAD',
                'australia': 'AUD',
                'brazil': 'BRL',
                'mexico': 'MXN',
                'south korea': 'KRW',
                'singapore': 'SGD',
                'hong kong': 'HKD',
                'india': 'INR',
                'china': 'CNY'
            }
            
            for country_key, expected_currency in country_currencies.items():
                if country_key in country:
                    currency = expected_currency
                    break
        
        # Check if we need to convert (non-USD data)
        needs_conversion = currency != 'USD'
        conversion_rate = 1.0
        if needs_conversion:
            conversion_rate = get_exchange_rate(currency, 'USD')
        
        # Extract financial data
        revenue = safe_float(annual_income.loc['Total Revenue', latest_year] if 'Total Revenue' in annual_income.index else 0)
        gross_profit = safe_float(annual_income.loc['Gross Profit', latest_year] if 'Gross Profit' in annual_income.index else 0)
        operating_income = safe_float(annual_income.loc['Operating Income', latest_year] if 'Operating Income' in annual_income.index else 0)
        ebitda = safe_float(annual_income.loc['EBITDA', latest_year] if 'EBITDA' in annual_income.index else 0)
        net_income = safe_float(annual_income.loc['Net Income', latest_year] if 'Net Income' in annual_income.index else 0)
        eps = safe_float(annual_income.loc['Diluted EPS', latest_year] if 'Diluted EPS' in annual_income.index else 0)
        shares_outstanding = safe_float(annual_income.loc['Diluted Average Shares', latest_year] if 'Diluted Average Shares' in annual_income.index else 0)
        
        # Convert to USD if needed
        if needs_conversion:
            revenue = convert_currency(revenue, currency, 'USD')
            gross_profit = convert_currency(gross_profit, currency, 'USD')
            operating_income = convert_currency(operating_income, currency, 'USD')
            ebitda = convert_currency(ebitda, currency, 'USD')
            net_income = convert_currency(net_income, currency, 'USD')
            eps = convert_currency(eps, currency, 'USD')
        
        # Compute FY free cash flow if possible
        ocf_latest = get_row(cashflow, ['Operating Cash Flow', 'Total Cash From Operating Activities'], latest_year)
        capex_latest = get_row(cashflow, ['Capital Expenditure', 'Capital Expenditures'], latest_year)
        # FCF = OCF - |CapEx| (CapEx is typically negative in cash flow statements)
        fcf_latest = ocf_latest + capex_latest if capex_latest < 0 else ocf_latest - capex_latest
        if needs_conversion:
            fcf_latest = convert_currency(fcf_latest, currency, 'USD')

        fy24_data = {
            "revenue": revenue,
            "gross_profit": gross_profit,
            "gross_margin_pct": (gross_profit / revenue * 100) if revenue > 0 and gross_profit > 0 else 0,
            "operating_income": operating_income,
            "ebitda": ebitda,
            "net_income": net_income,
            "eps": eps,
            "shares_outstanding": shares_outstanding,
            "fiscal_year": str(latest_year),
            "fcf": fcf_latest,
            "fcf_margin_pct": (fcf_latest / revenue * 100) if revenue > 0 else 0
        }
        
        # Market data (prices are usually already in USD, but check)
        current_price = safe_float(info.get('currentPrice', info.get('regularMarketPrice', 0)))
        market_cap = safe_float(info.get('marketCap', 0))
        enterprise_value = safe_float(info.get('enterpriseValue', 0))
        
        # Convert market data if needed - but NOT the share price
        if needs_conversion:
            # Don't convert current_price - keep it in original currency
            # Only convert market cap and enterprise value for consistency
            market_cap = convert_currency(market_cap, currency, 'USD')
            enterprise_value = convert_currency(enterprise_value, currency, 'USD')
        
        market_data = {
            "current_price": current_price,
            "market_cap": market_cap,
            "enterprise_value": enterprise_value,
            "pe_ratio": safe_float(info.get('trailingPE', 0)),
            "forward_pe": safe_float(info.get('forwardPE', 0)),
            "price_to_book": safe_float(info.get('priceToBook', 0)),
            "debt_to_equity": safe_float(info.get('debtToEquity', 0)),
        }
        
        # TTM revenue
        quarterly_income = company.quarterly_income_stmt
        if quarterly_income is not None and not quarterly_income.empty and len(quarterly_income.columns) >= 4:
            if 'Total Revenue' in quarterly_income.index:
                ttm_revenue = safe_float(quarterly_income.loc['Total Revenue'].iloc[:4].sum())
                if needs_conversion:
                    ttm_revenue = convert_currency(ttm_revenue, currency, 'USD')
                fy24_data["ttm_revenue"] = ttm_revenue
        
        # Historical financials (ensure FY21-FY24 if available), normalized to millions
        all_years = []
        for col in list(annual_income.columns):
            # Extract fiscal year as int (first 4 digits of column label)
            y_str = str(col)
            try:
                y_int = int(y_str[:4])
            except Exception:
                continue
            all_years.append((y_int, col))

        # Sort ascending by fiscal year
        all_years.sort(key=lambda t: t[0])

        # Prefer FY21..FY24 if present (removed 2020)
        preferred = [y for y in all_years if 2021 <= y[0] <= 2024]
        selected = preferred[-4:] if len(preferred) >= 4 else all_years[-4:]

        historical_financials = []
        for idx, (year_int, col) in enumerate(selected):
            year_revenue = safe_float(annual_income.loc['Total Revenue', col] if 'Total Revenue' in annual_income.index else 0)
            year_gross_profit = safe_float(annual_income.loc['Gross Profit', col] if 'Gross Profit' in annual_income.index else 0)
            year_ebitda = safe_float(annual_income.loc['EBITDA', col] if 'EBITDA' in annual_income.index else 0)
            year_net_income = safe_float(annual_income.loc['Net Income', col] if 'Net Income' in annual_income.index else 0)
            year_eps = safe_float(annual_income.loc['Diluted EPS', col] if 'Diluted EPS' in annual_income.index else 0)

            # FCF from cash flow when available
            ocf = get_row(cashflow, ['Operating Cash Flow', 'Total Cash From Operating Activities'], col)
            capex = get_row(cashflow, ['Capital Expenditure', 'Capital Expenditures'], col)
            # FCF = OCF - |CapEx| (CapEx is typically negative in cash flow statements)
            fcf_abs = ocf + capex if capex < 0 else ocf - capex

            # Convert to USD if needed
            if needs_conversion:
                year_revenue = convert_currency(year_revenue, currency, 'USD')
                year_gross_profit = convert_currency(year_gross_profit, currency, 'USD')
                year_ebitda = convert_currency(year_ebitda, currency, 'USD')
                year_net_income = convert_currency(year_net_income, currency, 'USD')
                year_eps = convert_currency(year_eps, currency, 'USD')
                fcf_abs = convert_currency(fcf_abs, currency, 'USD')

            # Calculate margins
            year_gross_margin = (year_gross_profit / year_revenue * 100) if year_revenue > 0 else 0
            year_ebitda_margin = (year_ebitda / year_revenue * 100) if year_revenue > 0 else 0
            year_net_income_margin = (year_net_income / year_revenue * 100) if year_revenue > 0 else 0

            # Revenue growth vs previous selected year
            if idx > 0:
                prev_year, prev_col = selected[idx-1]
                prev_revenue = safe_float(annual_income.loc['Total Revenue', prev_col] if 'Total Revenue' in annual_income.index else 0)
                if needs_conversion:
                    prev_revenue = convert_currency(prev_revenue, currency, 'USD')
                year_revenue_growth = ((year_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue > 0 else 0
            else:
                year_revenue_growth = 0

            # Compute FCF margin from statements when possible
            year_fcf = fcf_abs
            year_fcf_margin = (year_fcf / year_revenue * 100) if year_revenue > 0 else 0

            # Normalize to millions for absolute values
            revenue_m = year_revenue / 1_000_000
            gross_profit_m = year_gross_profit / 1_000_000
            ebitda_m = year_ebitda / 1_000_000
            net_income_m = year_net_income / 1_000_000
            fcf_m = year_fcf / 1_000_000

            # Label as FYxx (last two digits)
            fy_label = f"FY{str(year_int)[-2:]}"

            historical_financials.append({
                "year": fy_label,
                "revenue": revenue_m,
                "revenueGrowth": year_revenue_growth,
                "grossProfit": gross_profit_m,
                "grossMargin": year_gross_margin,
                "ebitda": ebitda_m,
                "ebitdaMargin": year_ebitda_margin,
                "netIncome": net_income_m,
                "netIncomeMargin": year_net_income_margin,
                "eps": year_eps,
                "fcf": fcf_m,
                "fcfMargin": year_fcf_margin
            })
        
        result = {
            "fy24_financials": fy24_data,
            "market_data": market_data,
            "historical_financials": historical_financials,
            "company_name": info.get('longName') or info.get('shortName') or ticker,
            "source": "yfinance",
            "currency_info": {
                "original_currency": currency,
                "converted_to_usd": needs_conversion,
                "conversion_rate": conversion_rate,
                "exchange_rate_source": "exchangerate-api.com" if needs_conversion else "none"
            }
        }
        
        # Emit strict JSON (no NaN/Infinity)
        return result
        
    except Exception as e:
        return {
            "error": str(e),
            "fy24_financials": { "revenue": 0, "gross_margin_pct": 0, "ebitda": 0, "net_income": 0, "eps": 0, "shares_outstanding": 0 },
            "market_data": { "current_price": 0, "market_cap": 0, "enterprise_value": 0, "pe_ratio": 0 },
            "currency_info": {
                "original_currency": "USD",
                "converted_to_usd": False,
                "conversion_rate": 1.0,
                "exchange_rate_source": "none"
            }
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python fetch_yfinance.py <TICKER>"}))
        sys.exit(1)
    ticker = sys.argv[1].upper()
    result = fetch_financials(ticker)
    # Ensure strict JSON output
    print(json.dumps(result, allow_nan=False)) 