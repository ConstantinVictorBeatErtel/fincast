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


def debug(*args, **kwargs):
    try:
        sys.stderr.write(" ".join(str(a) for a in args) + "\n")
    except Exception:
        pass

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


def calculate_ttm_from_quarterly(quarterly_income, quarterly_cashflow=None):
    """Calculate TTM (Trailing Twelve Months) figures from quarterly data."""
    ttm_data = {
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
        "period_label": "TTM",
        "latest_quarter": None
    }

    if quarterly_income is None or quarterly_income.empty or len(quarterly_income.columns) < 4:
        debug("Insufficient quarterly data for TTM calculation")
        return None

    # Get last 4 quarters (most recent first in yfinance)
    last_4_quarters = list(quarterly_income.columns[:4])
    debug(f"Calculating TTM from quarters: {[str(q) for q in last_4_quarters]}")

    # Identify latest quarter for labeling
    latest_q = last_4_quarters[0]
    try:
        # Extract quarter info (e.g., "2024-09-30" -> "Q3 2024")
        quarter_date = str(latest_q)[:10]
        year = quarter_date[:4]
        month = int(quarter_date[5:7])
        quarter_num = (month - 1) // 3 + 1
        ttm_data["period_label"] = f"TTM Q{quarter_num} {year}"
        ttm_data["latest_quarter"] = quarter_date
        debug(f"TTM period: {ttm_data['period_label']}")
    except Exception as e:
        debug(f"Could not parse quarter date: {e}")

    # Sum up metrics from last 4 quarters
    try:
        # Revenue
        if 'Total Revenue' in quarterly_income.index:
            ttm_data["revenue"] = sum(safe_float(quarterly_income.loc['Total Revenue', q]) for q in last_4_quarters)
            debug(f"TTM Revenue: ${ttm_data['revenue']:,.0f}")

        # Gross Profit
        if 'Gross Profit' in quarterly_income.index:
            ttm_data["gross_profit"] = sum(safe_float(quarterly_income.loc['Gross Profit', q]) for q in last_4_quarters)
            if ttm_data["revenue"] > 0:
                ttm_data["gross_margin_pct"] = (ttm_data["gross_profit"] / ttm_data["revenue"]) * 100
            debug(f"TTM Gross Profit: ${ttm_data['gross_profit']:,.0f}, Margin: {ttm_data['gross_margin_pct']:.1f}%")

        # EBITDA
        if 'EBITDA' in quarterly_income.index:
            ttm_data["ebitda"] = sum(safe_float(quarterly_income.loc['EBITDA', q]) for q in last_4_quarters)
            if ttm_data["revenue"] > 0:
                ttm_data["ebitda_margin_pct"] = (ttm_data["ebitda"] / ttm_data["revenue"]) * 100
            debug(f"TTM EBITDA: ${ttm_data['ebitda']:,.0f}, Margin: {ttm_data['ebitda_margin_pct']:.1f}%")

        # Net Income
        if 'Net Income' in quarterly_income.index:
            ttm_data["net_income"] = sum(safe_float(quarterly_income.loc['Net Income', q]) for q in last_4_quarters)
            debug(f"TTM Net Income: ${ttm_data['net_income']:,.0f}")

        # EPS (use most recent quarter's diluted shares for calculation)
        if 'Diluted Average Shares' in quarterly_income.index:
            # Get shares from most recent quarter
            ttm_data["shares_outstanding"] = safe_float(quarterly_income.loc['Diluted Average Shares', last_4_quarters[0]])
            if ttm_data["shares_outstanding"] > 0 and ttm_data["net_income"] != 0:
                ttm_data["eps"] = ttm_data["net_income"] / ttm_data["shares_outstanding"]
            debug(f"TTM EPS: ${ttm_data['eps']:.2f}")

        # FCF from quarterly cash flow statement
        if quarterly_cashflow is not None and not quarterly_cashflow.empty:
            try:
                ocf_labels = ['Operating Cash Flow', 'Total Cash From Operating Activities', 'Cash Flow From Operating Activities']
                capex_labels = ['Capital Expenditure', 'Capital Expenditures']

                ttm_ocf = 0
                ttm_capex = 0

                for q in last_4_quarters:
                    if q in quarterly_cashflow.columns:
                        # Get OCF for this quarter
                        for ocf_label in ocf_labels:
                            if ocf_label in quarterly_cashflow.index:
                                ttm_ocf += safe_float(quarterly_cashflow.loc[ocf_label, q])
                                break
                        # Get CapEx for this quarter
                        for capex_label in capex_labels:
                            if capex_label in quarterly_cashflow.index:
                                ttm_capex += safe_float(quarterly_cashflow.loc[capex_label, q])
                                break

                ttm_data["fcf"] = ttm_ocf + ttm_capex  # CapEx is negative
                if ttm_data["revenue"] > 0:
                    ttm_data["fcf_margin_pct"] = (ttm_data["fcf"] / ttm_data["revenue"]) * 100
                debug(f"TTM FCF: ${ttm_data['fcf']:,.0f}, Margin: {ttm_data['fcf_margin_pct']:.1f}%")
            except Exception as fcf_err:
                debug(f"TTM FCF calculation failed: {fcf_err}")
                # Fallback to 25% estimate
                if ttm_data["revenue"] > 0:
                    ttm_data["fcf"] = ttm_data["revenue"] * 0.25
                    ttm_data["fcf_margin_pct"] = 25.0
        else:
            # No cash flow data, use 25% estimate
            if ttm_data["revenue"] > 0:
                ttm_data["fcf"] = ttm_data["revenue"] * 0.25
                ttm_data["fcf_margin_pct"] = 25.0
                debug(f"TTM FCF (estimated): ${ttm_data['fcf']:,.0f}")

    except Exception as e:
        debug(f"Error calculating TTM metrics: {e}")
        return None

    return ttm_data


def fetch_financials(ticker):
    """Fetch financial data from yfinance for a given ticker."""
    try:
        debug(f"Fetching data for {ticker}...")

        # Create ticker object
        company = yf.Ticker(ticker)

        # Get current price from download method
        current_price = 0
        try:
            hist = yf.download(ticker, period="1mo", interval="1d", progress=False, ignore_tz=True)
            if hist is not None and not hist.empty:
                current_price = safe_float(hist['Close'].iloc[-1])
                debug(f"Got current price from download: ${current_price}")
            else:
                debug("Download returned empty data")
        except Exception as e:
            debug(f"Download failed: {e}")

        # Get financial data using the working methods
        fy24_financials = {
            "revenue": 0,
            "gross_margin_pct": 0,
            "ebitda": 0,
            "net_income": 0,
            "eps": 0,
            "shares_outstanding": 0
        }

        market_data = {
            "current_price": current_price,
            "market_cap": 0,
            "enterprise_value": 0,
            "pe_ratio": 0
        }

        historical_financials = []
        ttm_financials = None

        try:
            # Get income statement data (annual)
            income_stmt = company.income_stmt
            # Get quarterly income statement for TTM calculation
            quarterly_income = None
            quarterly_cashflow = None
            try:
                quarterly_income = company.quarterly_income_stmt
                debug(f"Fetched quarterly income statement with {len(quarterly_income.columns) if quarterly_income is not None and not quarterly_income.empty else 0} quarters")
            except Exception as qe:
                debug(f"Could not fetch quarterly income statement: {qe}")

            # Try to get cash flow statement (newer yfinance uses cash_flow)
            cash_flow = None
            try:
                cash_flow = company.cash_flow
            except Exception:
                try:
                    cash_flow = company.cashflow
                except Exception:
                    cash_flow = None

            # Get quarterly cash flow for TTM calculation
            try:
                quarterly_cashflow = company.quarterly_cashflow
                debug(f"Fetched quarterly cash flow with {len(quarterly_cashflow.columns) if quarterly_cashflow is not None and not quarterly_cashflow.empty else 0} quarters")
            except Exception:
                try:
                    quarterly_cashflow = company.quarterly_cash_flow
                except Exception:
                    quarterly_cashflow = None

            # Calculate TTM financials from quarterly data
            if quarterly_income is not None and not quarterly_income.empty:
                ttm_financials = calculate_ttm_from_quarterly(quarterly_income, quarterly_cashflow)
                if ttm_financials:
                    debug(f"Successfully calculated TTM financials for {ttm_financials['period_label']}")
                    # Use TTM as the primary financials instead of annual
                    fy24_financials = {
                        "revenue": ttm_financials["revenue"],
                        "gross_profit": ttm_financials["gross_profit"],
                        "gross_margin_pct": ttm_financials["gross_margin_pct"],
                        "ebitda": ttm_financials["ebitda"],
                        "ebitda_margin_pct": ttm_financials.get("ebitda_margin_pct", 0),
                        "net_income": ttm_financials["net_income"],
                        "eps": ttm_financials["eps"],
                        "shares_outstanding": ttm_financials["shares_outstanding"],
                        "fcf": ttm_financials["fcf"],
                        "fcf_margin_pct": ttm_financials["fcf_margin_pct"],
                        "period_label": ttm_financials["period_label"],
                        "latest_quarter": ttm_financials["latest_quarter"]
                    }
                    debug(f"Using TTM financials as primary data source")
                else:
                    debug("TTM calculation failed, falling back to annual data")
            else:
                debug("No quarterly data available, using annual data")

            # If TTM calculation failed or no quarterly data, fall back to annual data
            if not ttm_financials and income_stmt is not None and not income_stmt.empty and len(income_stmt.columns) > 0:
                latest_year = income_stmt.columns[0]
                debug(f"Latest financial year: {latest_year}")

                # Extract key metrics from annual data
                if 'Total Revenue' in income_stmt.index:
                    revenue = income_stmt.loc['Total Revenue', latest_year]
                    fy24_financials["revenue"] = safe_float(revenue)
                    debug(f"Revenue: ${fy24_financials['revenue']:,.0f}")

                if 'Gross Profit' in income_stmt.index and 'Total Revenue' in income_stmt.index:
                    gross_profit = income_stmt.loc['Gross Profit', latest_year]
                    revenue = income_stmt.loc['Total Revenue', latest_year]
                    fy24_financials["gross_profit"] = safe_float(gross_profit)
                    debug(f"Gross Profit: ${fy24_financials['gross_profit']:,.0f}")
                    if revenue != 0:
                        fy24_financials["gross_margin_pct"] = (safe_float(gross_profit) / safe_float(revenue)) * 100
                        debug(f"Gross Margin: {fy24_financials['gross_margin_pct']:.1f}%")

                if 'EBITDA' in income_stmt.index:
                    ebitda = income_stmt.loc['EBITDA', latest_year]
                    fy24_financials["ebitda"] = safe_float(ebitda)
                    debug(f"EBITDA: ${fy24_financials['ebitda']:,.0f}")
                    # Calculate EBITDA margin
                    if 'Total Revenue' in income_stmt.index:
                        revenue = fy24_financials["revenue"]
                        if revenue != 0:
                            fy24_financials["ebitda_margin_pct"] = (safe_float(ebitda) / revenue) * 100
                            debug(f"EBITDA Margin: {fy24_financials['ebitda_margin_pct']:.1f}%")

                if 'Net Income' in income_stmt.index:
                    net_income = income_stmt.loc['Net Income', latest_year]
                    fy24_financials["net_income"] = safe_float(net_income)
                    debug(f"Net Income: ${fy24_financials['net_income']:,.0f}")

                if 'Diluted EPS' in income_stmt.index:
                    eps = income_stmt.loc['Diluted EPS', latest_year]
                    fy24_financials["eps"] = safe_float(eps)
                    debug(f"EPS: ${fy24_financials['eps']:.2f}")

                if 'Diluted Average Shares' in income_stmt.index:
                    shares = income_stmt.loc['Diluted Average Shares', latest_year]
                    fy24_financials["shares_outstanding"] = safe_float(shares)
                    debug(f"Shares Outstanding: {fy24_financials['shares_outstanding']:,.0f}")
                
                # Calculate FCF (Free Cash Flow) from cash flow statement when available
                try:
                    if cash_flow is not None and not cash_flow.empty and latest_year in cash_flow.columns:
                        # Support multiple possible index labels for OCF and CapEx
                        ocf_labels = [
                            'Operating Cash Flow',
                            'Total Cash From Operating Activities',
                            'Cash Flow From Operating Activities'
                        ]
                        capex_labels = [
                            'Capital Expenditure',
                            'Capital Expenditures'
                        ]
                        ocf = None
                        capex = None
                        for ocf_label in ocf_labels:
                            if ocf_label in cash_flow.index:
                                ocf = safe_float(cash_flow.loc[ocf_label, latest_year])
                                break
                        for capex_label in capex_labels:
                            if capex_label in cash_flow.index:
                                capex = safe_float(cash_flow.loc[capex_label, latest_year])
                                break
                        if ocf is not None and capex is not None:
                            # In Yahoo data CapEx is typically negative; ocf + capex is correct
                            fcf_latest = safe_float(ocf + capex)
                            fy24_financials["fcf"] = fcf_latest
                            if fy24_financials["revenue"]:
                                fy24_financials["fcf_margin_pct"] = (fcf_latest / fy24_financials["revenue"]) * 100.0
                            debug(f"FCF (from CF stmt): ${fy24_financials['fcf']:,.0f}, FCF Margin: {fy24_financials.get('fcf_margin_pct', 0):.1f}%")
                        else:
                            # Fallback: estimate 25% if CF data missing
                            revenue = fy24_financials["revenue"]
                            estimated_fcf = revenue * 0.25
                            fy24_financials["fcf"] = estimated_fcf
                            fy24_financials["fcf_margin_pct"] = 25.0
                            debug(f"Estimated FCF (fallback): ${estimated_fcf:,.0f} (25% of revenue)")
                    else:
                        revenue = fy24_financials["revenue"]
                        estimated_fcf = revenue * 0.25
                        fy24_financials["fcf"] = estimated_fcf
                        fy24_financials["fcf_margin_pct"] = 25.0
                        debug(f"Estimated FCF (no CF stmt): ${estimated_fcf:,.0f} (25% of revenue)")
                except Exception as cferr:
                    debug(f"FCF computation failed: {cferr}")
                    revenue = fy24_financials["revenue"]
                    estimated_fcf = revenue * 0.25
                    fy24_financials["fcf"] = estimated_fcf
                    fy24_financials["fcf_margin_pct"] = 25.0
                    debug(f"Estimated FCF (error fallback): ${estimated_fcf:,.0f} (25% of revenue)")

                # Build historical financials (last up to 4 periods) in $M
                try:
                    # Ensure we have required rows
                    idx = income_stmt.index
                    needed = ['Total Revenue', 'Gross Profit', 'EBITDA', 'Net Income', 'Diluted EPS']
                    if all(metric in idx for metric in needed):
                        # Use last 4 columns (most recent first by yfinance convention)
                        cols = list(income_stmt.columns)[:4]
                        # Reverse to oldest->newest for nicer display
                        cols = cols[::-1]
                        prev_revenue_m = None
                        for col in cols:
                            # Column may be a Timestamp or string; derive a FY label
                            year_label = str(col)
                            year_num = None
                            try:
                                year_num = int(str(col)[:4])
                            except Exception:
                                pass
                            if year_num:
                                fy_label = f"FY{str(year_num)[-2:]}"
                            else:
                                fy_label = f"FY{year_label}"

                            rev = safe_float(income_stmt.loc['Total Revenue', col])
                            gp = safe_float(income_stmt.loc['Gross Profit', col])
                            ebitda_val = safe_float(income_stmt.loc['EBITDA', col])
                            ni = safe_float(income_stmt.loc['Net Income', col])
                            eps_val = safe_float(income_stmt.loc['Diluted EPS', col])

                            rev_m = rev / 1_000_000.0
                            gp_m = gp / 1_000_000.0
                            ebitda_m = ebitda_val / 1_000_000.0
                            ni_m = ni / 1_000_000.0
                            # Historical FCF from cash flow statement if available
                            fcf_val = None
                            try:
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
                                        fcf_val = safe_float(ocf + capex)
                            except Exception as hcferr:
                                debug(f"Historical FCF compute failed for {col}: {hcferr}")
                            if fcf_val is None:
                                fcf_val = rev * 0.25  # fallback
                            fcf_m = fcf_val / 1_000_000.0

                            gross_margin = (gp / rev * 100.0) if rev else 0.0
                            ebitda_margin = (ebitda_val / rev * 100.0) if rev else 0.0
                            ni_margin = (ni / rev * 100.0) if rev else 0.0
                            fcf_margin = (fcf_val / rev * 100.0) if rev else 0.0

                            if prev_revenue_m is not None and prev_revenue_m > 0:
                                rev_growth = ((rev_m - prev_revenue_m) / prev_revenue_m) * 100.0
                            else:
                                rev_growth = 0.0
                            prev_revenue_m = rev_m

                            historical_financials.append({
                                "year": fy_label,
                                "revenue": rev_m,
                                "revenueGrowth": rev_growth,
                                "grossProfit": gp_m,
                                "grossMargin": gross_margin,
                                "ebitda": ebitda_m,
                                "ebitdaMargin": ebitda_margin,
                                "fcf": fcf_m,
                                "fcfMargin": fcf_margin,
                                "netIncome": ni_m,
                                "netIncomeMargin": ni_margin,
                                "eps": eps_val
                            })
                except Exception as he:
                    debug(f"Failed to build historical financials: {he}")
            
            # Get market data
            info = company.info
            if info:
                if 'marketCap' in info:
                    market_data["market_cap"] = safe_float(info['marketCap'])
                    debug(f"Market Cap: ${market_data['market_cap']:,.0f}")
                
                if 'enterpriseValue' in info:
                    market_data["enterprise_value"] = safe_float(info['enterpriseValue'])
                    debug(f"Enterprise Value: ${market_data['enterprise_value']:,.0f}")
                
                if 'trailingPE' in info:
                    market_data["pe_ratio"] = safe_float(info['trailingPE'])
                    debug(f"P/E Ratio: {market_data['pe_ratio']:.2f}")
                
                # Update current price if not already set
                if current_price == 0 and 'currentPrice' in info:
                    market_data["current_price"] = safe_float(info['currentPrice'])
                    current_price = market_data["current_price"]
                    debug(f"Current Price from info: ${current_price:.2f}")
            
        except Exception as e:
            debug(f"Error getting financial data: {e}")
        
        # Get company name
        company_name = ticker
        try:
            if info and 'longName' in info:
                company_name = info['longName']
            elif info and 'shortName' in info:
                company_name = info['shortName']
        except Exception as e:
            debug(f"Error getting company name: {e}")
        
        # Get currency info
        currency_info = {
            "original_currency": "USD",
            "converted_to_usd": False,
            "conversion_rate": 1.0,
            "exchange_rate_source": "none"
        }
        
        try:
            if info and 'currency' in info:
                original_currency = info['currency']
                if original_currency and original_currency != 'USD':
                    currency_info["original_currency"] = original_currency
                    conversion_rate = get_exchange_rate(original_currency, 'USD')
                    currency_info["conversion_rate"] = conversion_rate
                    currency_info["converted_to_usd"] = True
                    currency_info["exchange_rate_source"] = "exchangerate-api"
                    
                    # Convert financial values to USD
                    if fy24_financials["revenue"] > 0:
                        fy24_financials["revenue"] = convert_currency(fy24_financials["revenue"], original_currency, 'USD')
                    if fy24_financials["ebitda"] > 0:
                        fy24_financials["ebitda"] = convert_currency(fy24_financials["ebitda"], original_currency, 'USD')
                    if fy24_financials["net_income"] > 0:
                        fy24_financials["net_income"] = convert_currency(fy24_financials["net_income"], original_currency, 'USD')
                    if market_data["market_cap"] > 0:
                        market_data["market_cap"] = convert_currency(market_data["market_cap"], original_currency, 'USD')
                    if market_data["enterprise_value"] > 0:
                        market_data["enterprise_value"] = convert_currency(market_data["enterprise_value"], original_currency, 'USD')

                    # Convert historical values to USD (they are in $M, so convert base then divide)
                    if historical_financials:
                        for row in historical_financials:
                            # Convert base currency amounts first
                            row["revenue"] = convert_currency(row["revenue"] * 1_000_000.0, original_currency, 'USD') / 1_000_000.0
                            row["grossProfit"] = convert_currency(row["grossProfit"] * 1_000_000.0, original_currency, 'USD') / 1_000_000.0
                            row["ebitda"] = convert_currency(row["ebitda"] * 1_000_000.0, original_currency, 'USD') / 1_000_000.0
                            row["netIncome"] = convert_currency(row["netIncome"] * 1_000_000.0, original_currency, 'USD') / 1_000_000.0
                            row["fcf"] = convert_currency(row["fcf"] * 1_000_000.0, original_currency, 'USD') / 1_000_000.0
        except Exception as e:
            debug(f"Error handling currency conversion: {e}")
        
        result = {
            "fy24_financials": fy24_financials,
            "market_data": market_data,
            "company_name": company_name,
            "source": "yfinance",
            "currency_info": currency_info,
            "historical_financials": historical_financials
        }
        
        debug("Successfully fetched financial data!")
        return result
        
    except Exception as e:
        debug(f"Error in fetch_financials: {e}")
        # Return fallback data
        return {
            "fy24_financials": {
                "revenue": 0,
                "gross_margin_pct": 0,
                "ebitda": 0,
                "net_income": 0,
                "eps": 0,
                "shares_outstanding": 0
            },
            "market_data": {
                "current_price": current_price,
                "market_cap": 0,
                "enterprise_value": 0,
                "pe_ratio": 0
            },
            "company_name": ticker,
            "source": "yfinance_alternative",
            "currency_info": {
                "original_currency": "USD",
                "converted_to_usd": False,
                "conversion_rate": 1.0,
                "exchange_rate_source": "none"
            }
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        debug(json.dumps({"error": "Usage: python fetch_yfinance.py <TICKER>"}))
        sys.exit(1)
    ticker = sys.argv[1].upper()
    result = fetch_financials(ticker)
    # Ensure strict JSON output
    print(json.dumps(result, allow_nan=False)) 