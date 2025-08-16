import json
import sys
import os
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
        cashflow = getattr(company, 'cash_flow', None)
        if cashflow is None or cashflow.empty:
            cashflow = getattr(company, 'cashflow', None)

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
        
        # Extract financial data for latest year
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
        
        # Calculate margins
        gross_margin_pct = (gross_profit / revenue * 100) if revenue > 0 else 0
        ebitda_margin_pct = (ebitda / revenue * 100) if revenue > 0 else 0
        net_income_margin_pct = (net_income / revenue * 100) if revenue > 0 else 0
        
        # Get market data
        market_data = {}
        try:
            # Get current price
            current_price = safe_float(info.get('currentPrice', 0))
            if current_price == 0:
                current_price = safe_float(info.get('regularMarketPrice', 0))
            
            # Get market cap
            market_cap = safe_float(info.get('marketCap', 0))
            if market_cap == 0:
                market_cap = shares_outstanding * current_price
            
            # Get enterprise value
            enterprise_value = safe_float(info.get('enterpriseValue', 0))
            if enterprise_value == 0:
                enterprise_value = market_cap
            
            # Get P/E ratio
            pe_ratio = safe_float(info.get('trailingPE', 0))
            if pe_ratio == 0 and eps > 0:
                pe_ratio = current_price / eps
            
            market_data = {
                'current_price': current_price,
                'market_cap': market_cap,
                'enterprise_value': enterprise_value,
                'pe_ratio': pe_ratio
            }
        except Exception:
            market_data = {
                'current_price': 0,
                'market_cap': 0,
                'enterprise_value': 0,
                'pe_ratio': 0
            }
        
        # Prepare FY24 data
        fy24_data = {
            'revenue': revenue / 1_000_000,  # Convert to millions
            'gross_margin_pct': gross_margin_pct,
            'ebitda': ebitda / 1_000_000,  # Convert to millions
            'net_income': net_income / 1_000_000,  # Convert to millions
            'eps': eps,
            'shares_outstanding': shares_outstanding
        }
        
        result = {
            "fy24_financials": fy24_data,
            "market_data": market_data,
            "company_name": info.get('longName') or info.get('shortName') or ticker,
            "source": "yfinance",
            "currency_info": {
                "original_currency": currency,
                "converted_to_usd": needs_conversion,
                "conversion_rate": conversion_rate,
                "exchange_rate_source": "exchangerate-api.com" if needs_conversion else "none"
            }
        }
        
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

def handler(request):
    """Vercel Python runtime handler function"""
    try:
        # Get ticker from query parameters
        ticker = request.args.get('ticker')
        
        if not ticker:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing ticker parameter'})
            }
        
        # Fetch data using the embedded function
        result = fetch_financials(ticker)
        
        # Return successful response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        # Return error response
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'type': type(e).__name__
            })
        }

# Alternative handler format for Vercel
def lambda_handler(event, context):
    """Alternative handler format for Vercel Python runtime"""
    try:
        # Parse query parameters from event
        query_params = event.get('queryStringParameters', {}) or {}
        ticker = query_params.get('ticker')
        
        if not ticker:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing ticker parameter'})
            }
        
        # Fetch data using the embedded function
        result = fetch_financials(ticker)
        
        # Return successful response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        # Return error response
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'type': type(e).__name__
            })
        }
