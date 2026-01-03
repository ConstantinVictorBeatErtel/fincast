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
import pandas as pd
import os
import time

# Fix cache location for Vercel's read-only filesystem
os.environ['HOME'] = '/tmp'
os.environ['XDG_CACHE_HOME'] = '/tmp/.cache'
try:
    yf.set_tz_cache_location('/tmp')
except:
    pass




def debug(*args, **kwargs):
    try:
        sys.stderr.write(" ".join(str(a) for a in args) + "\n")
    except Exception:
        pass


def retry_with_backoff(func, max_retries=3, initial_delay=1.0):
    """
    Retry a function with exponential backoff for rate limiting.
    Handles 429 errors and connection issues.
    """
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            error_str = str(e)
            # Check if it's a rate limit error
            if '429' in error_str or 'Too Many Requests' in error_str or 'JSONDecodeError' in error_str:
                if attempt < max_retries - 1:
                    delay = initial_delay * (2 ** attempt)  # Exponential backoff
                    debug(f"Rate limited (attempt {attempt + 1}/{max_retries}), retrying in {delay}s...")
                    time.sleep(delay)
                    continue
            # For other errors or last attempt, raise
            raise
    return None

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


def get_fiscal_quarter(date_obj):
    """Determine fiscal quarter based on month."""
    month = date_obj.month
    if 1 <= month <= 3: return 1
    elif 4 <= month <= 6: return 2
    elif 7 <= month <= 9: return 3
    else: return 4


def get_fiscal_info(ticker_info, last_quarter_date):
    """
    Determine current fiscal year and quarter label accurately.
    """
    try:
        if not last_quarter_date:
            return None
            
        lq_date = pd.to_datetime(last_quarter_date)
        debug(f"[Fiscal] Calculating for Last Q Date: {lq_date}")
        
        # Default: Calendar Year
        current_fy = lq_date.year
        q_num = (lq_date.month - 1) // 3 + 1
        
        # Enriched Logic using yfinance info
        if ticker_info:
            last_fy_end = ticker_info.get('lastFiscalYearEnd')
            if last_fy_end:
                # Convert unix timestamp
                last_fy_date = pd.to_datetime(last_fy_end, unit='s')
                
                # If the latest quarter is AFTER the last fiscal year end
                if lq_date > last_fy_date:
                    # We are in the NEW fiscal year
                    current_fy = last_fy_date.year + 1
                    
                    # Offset calculation:
                    # distance in months from FY end
                    months_diff = (lq_date.year - last_fy_date.year) * 12 + (lq_date.month - last_fy_date.month)
                    q_num = ((months_diff - 1) // 3) + 1
                    if q_num > 4: q_num = 4
                    if q_num < 1: q_num = 1
                else:
                    # We are ON or BEFORE the last reported annual date
                    current_fy = last_fy_date.year
                    # Calculate Quarter relative to FY end?
                    # Actually if we are using historical data, usually lq_date IS the quarter end.
                    # If lq_date <= last_fy_date, it means it's part of the OLD FY.
                    # But usually annual report comes AFTER Q4. 
                    # If lq_date == last_fy_date, it is Q4.
                    if lq_date == last_fy_date:
                        q_num = 4
                    else:
                         # It is a previous quarter of the same completed FY?
                         # e.g. lq_date = Mar 2025. last_fy_date = Jun 2025.
                         # This is Q3 FY25.
                         months_diff = (lq_date.year - last_fy_date.year) * 12 + (lq_date.month - last_fy_date.month)
                         # months_diff is negative, e.g. -3.
                         # Q4 is 0 diff (or 1-3 months before end).
                         # Q3 is -3 diff.
                         # Formula: Q = 4 - (abs(diff) // 3)
                         q_num = 4 - (abs(months_diff) // 3)
                         if q_num < 1: q_num = 1

        fy_short = str(current_fy)[-2:]
        return {
            "latest_quarter_date": lq_date.strftime('%Y-%m-%d'),
            "latest_quarter_label": f"Q{int(q_num)} FY{fy_short}", 
            "ttm_label": f"TTM (As of Q{int(q_num)} FY{fy_short})",
            "current_fiscal_year": current_fy
        }
    except Exception as e:
        debug(f"Error getting fiscal info: {e}")
        return None

def calculate_ttm(quarterly_df, col_name):
    """Sum last 4 columns (quarters) of a dataframe row."""
    if quarterly_df is None or quarterly_df.empty or col_name not in quarterly_df.index:
        return 0
        
    try:
        # Get columns sorted by date descending (newest first)
        cols = sorted(quarterly_df.columns, reverse=True)
        latest_4 = cols[:4]
        
        if len(latest_4) < 4:
            # Not enough data for full TTM, scale it? No, safer to return partial or 0.
            # Let's return sum of what we have but warn? 
            # Ideally we want 4 quarters.
            pass

        total = 0
        for c in latest_4:
            val = quarterly_df.loc[col_name, c]
            total += safe_float(val)
        return total
    except Exception:
        return 0

def fetch_financials(ticker):
    """Fetch financial data from yfinance for a given ticker."""
    # Init current_price safety
    current_price = 0
    try:
        debug(f"Fetching data for {ticker}...")

        # Create ticker object (let yfinance handle session)
        company = yf.Ticker(ticker)

        # Get current price
        current_price = 0
        try:
            current_price = safe_float(company.fast_info.get('last_price', 0))
            if current_price == 0:
                raise Exception("fast_info returned 0")
        except Exception as e:
            debug(f"Fast info price fetch failed: {e}, trying fallback...")
            try:
                # Fallback: Download 1 day of data
                time.sleep(0.3) # Rate limit check
                hist = yf.download(ticker, period="1d", interval="1d", progress=False, ignore_tz=True)
                if hist is not None and not hist.empty and 'Close' in hist.columns:
                    val = hist['Close'].iloc[-1]
                    if isinstance(val, pd.Series): val = val.iloc[0]
                    current_price = safe_float(val)
            except Exception as e2:
                debug(f"Fallback price fetch failed: {e2}")
        
        # Fetch Quarterly Data for TTM
        q_income = company.quarterly_income_stmt
        q_cash = company.quarterly_cash_flow
        q_balance = company.quarterly_balance_sheet
        
        # Annual Data
        income_stmt = company.income_stmt
        balance_sheet = company.balance_sheet
        cash_flow = company.cash_flow
        
        # Get Info for Fiscal Year logic
        # REMOVED company.info call to avoid 429 errors
        info = None

        # 1. Determine Fiscal Info / Latest Quarter
        latest_date = None
        if q_income is not None and not q_income.empty:
             # Columns are dates. Find the max date.
             dates = [pd.to_datetime(c) for c in q_income.columns]
             if dates:
                 latest_date = max(dates)
        
        fiscal_info = get_fiscal_info(info, latest_date)
        
        # 2. Calculate TTM Financials
        ttm_financials = {
            "revenue": 0,
            "net_income": 0,
            "gross_profit": 0,
            "ebitda": 0,
            "eps": 0
        }
        
        if q_income is not None and not q_income.empty:
            ttm_financials["revenue"] = calculate_ttm(q_income, "Total Revenue")
            ttm_financials["net_income"] = calculate_ttm(q_income, "Net Income")
            ttm_financials["gross_profit"] = calculate_ttm(q_income, "Gross Profit")
            ttm_financials["ebitda"] = calculate_ttm(q_income, "EBITDA")
            
            # Gross Margin TTM
            if ttm_financials["revenue"] > 0:
                  ttm_financials["gross_margin_pct"] = (ttm_financials["gross_profit"] / ttm_financials["revenue"]) * 100
            else:
                  ttm_financials["gross_margin_pct"] = 0

        # Calculate TTM EPS
        if q_income is not None:
            if 'Diluted EPS' in q_income.index:
                 ttm_financials["eps"] = calculate_ttm(q_income, 'Diluted EPS')
            elif 'Basic EPS' in q_income.index:
                 ttm_financials["eps"] = calculate_ttm(q_income, 'Basic EPS')

        # 3. Get Annual (FY24 or latest full FY) Financials (Legacy support + Backup)
        annual_financials = {
            "revenue": 0,
            "gross_margin_pct": 0,
            "ebitda": 0,
            "net_income": 0,
            "eps": 0,
            "shares_outstanding": 0,
            "fiscal_year": "N/A"
        }

        # Get shares outstanding from balance sheet (avoid company.info API call for rate limiting)
        shares_outstanding = 0
        try:
            shares_outstanding = safe_float(company.fast_info.get('shares', 0))
        except:
            pass
            
        if shares_outstanding == 0 and balance_sheet is not None and 'Ordinary Shares Number' in balance_sheet.index:
             shares_outstanding = safe_float(balance_sheet.loc['Ordinary Shares Number', balance_sheet.columns[0]])

        if income_stmt is not None and not income_stmt.empty:
            latest_col = income_stmt.columns[0]
            annual_financials["fiscal_year"] = str(pd.to_datetime(latest_col).year)
            
            rev = safe_float(income_stmt.loc['Total Revenue', latest_col]) if 'Total Revenue' in income_stmt.index else 0
            gp = safe_float(income_stmt.loc['Gross Profit', latest_col]) if 'Gross Profit' in income_stmt.index else 0
            ni = safe_float(income_stmt.loc['Net Income', latest_col]) if 'Net Income' in income_stmt.index else 0
            ebitda = safe_float(income_stmt.loc['EBITDA', latest_col]) if 'EBITDA' in income_stmt.index else 0
            
            annual_financials["revenue"] = rev
            annual_financials["gross_profit"] = gp
            annual_financials["net_income"] = ni
            annual_financials["ebitda"] = ebitda
            annual_financials["gross_margin_pct"] = (gp / rev * 100) if rev else 0
            annual_financials["shares_outstanding"] = shares_outstanding
            
            if 'Diluted EPS' in income_stmt.index:
                annual_financials["eps"] = safe_float(income_stmt.loc['Diluted EPS', latest_col])
            else:
                 annual_financials["eps"] = ni / shares_outstanding if shares_outstanding else 0

        # Market Data
        market_data = {
            "current_price": current_price,
            "market_cap": current_price * shares_outstanding,
            "pe_ratio": 0,
            "enterprise_value": 0
        }
        
        eff_eps = ttm_financials["eps"] if ttm_financials["eps"] != 0 else annual_financials["eps"]
        if eff_eps > 0:
            market_data["pe_ratio"] = current_price / eff_eps

        # Try to get Enterprise Value from info directly - REMOVED info call
        # if info:
        #      ev = safe_float(info.get('enterpriseValue', 0))
        #      if ev > 0:
        #          market_data["enterprise_value"] = ev

        # Construct Output
        result = {
            "fiscal_info": fiscal_info,
            "ttm_financials": ttm_financials,
            "fy24_financials": annual_financials, 
            "market_data": market_data,
            "company_name": ticker, 
            "currency_info": { "original_currency": "USD" }, 
            "historical_financials": [] 
        }
        
        # Company Name is already set to ticker in result init
        pass

        # PRESERVE HISTORICAL FINANCIALS LOGIC
        hist_records = []
        
        # NOTE: Removed 10-year price download to reduce API calls (was causing 429s)
        # Historical valuation multiples will not be calculated
        price_history = None

        def get_price_at_date(df, date_str):
             # Disabled to reduce API calls
             return 0

        if income_stmt is not None and not income_stmt.empty:
             cols = list(income_stmt.columns)
             # Sort cols by date ascending for growth calc
             cols = sorted(cols, key=lambda x: pd.to_datetime(x))
             
             for i, col in enumerate(cols):
                 try:
                     col_dt = pd.to_datetime(col)
                     year_str = str(col_dt.year)
                     
                     # Basic Metrics
                     rev = safe_float(income_stmt.loc['Total Revenue', col])
                     gp = safe_float(income_stmt.loc['Gross Profit', col]) if 'Gross Profit' in income_stmt.index else 0
                     ni = safe_float(income_stmt.loc['Net Income', col])
                     
                     rec = {
                         "year": year_str,
                         "revenue": rev / 1e6,
                         "grossProfit": gp / 1e6,
                         "grossMargin": (gp/rev*100) if rev else 0,
                         "netIncome": ni / 1e6,
                         "netIncomeMargin": (ni/rev*100) if rev else 0,
                         "eps": safe_float(income_stmt.loc['Diluted EPS', col]) if 'Diluted EPS' in income_stmt.index else 0
                     }

                     # EBITDA
                     ebitda_val = 0
                     if 'EBITDA' in income_stmt.index:
                          ebitda_val = safe_float(income_stmt.loc['EBITDA', col])
                     elif 'Normalized EBITDA' in income_stmt.index:
                          ebitda_val = safe_float(income_stmt.loc['Normalized EBITDA', col])
                     
                     rec["ebitda"] = ebitda_val / 1e6
                     rec["ebitdaMargin"] = (ebitda_val/rev*100) if rev else 0

                     # Free Cash Flow & OCF/CapEx
                     fcf_val = 0
                     shares_hist = shares_outstanding # Default to current
                     if balance_sheet is not None and col in balance_sheet.columns:
                         if 'Ordinary Shares Number' in balance_sheet.index:
                              shares_hist = safe_float(balance_sheet.loc['Ordinary Shares Number', col])
                         elif 'Common Stock Shares Outstanding' in balance_sheet.index:
                              shares_hist = safe_float(balance_sheet.loc['Common Stock Shares Outstanding', col])

                     if cash_flow is not None and not cash_flow.empty:
                         if col in cash_flow.columns:
                             if 'Free Cash Flow' in cash_flow.index:
                                 fcf_val = safe_float(cash_flow.loc['Free Cash Flow', col])
                             elif 'us-gaap:FreeCashFlow' in cash_flow.index: # rare
                                 fcf_val = safe_float(cash_flow.loc['us-gaap:FreeCashFlow', col])
                             elif 'Operating Cash Flow' in cash_flow.index and 'Capital Expenditure' in cash_flow.index:
                                 ocf = safe_float(cash_flow.loc['Operating Cash Flow', col])
                                 capex = safe_float(cash_flow.loc['Capital Expenditure', col])
                                 fcf_val = ocf + capex
                     
                     rec["fcf"] = fcf_val / 1e6
                     rec["fcfMargin"] = (fcf_val/rev*100) if rev else 0

                     # ROIC Calculation
                     roic_val = 0
                     if balance_sheet is not None and not balance_sheet.empty and col in balance_sheet.columns:
                         try:
                             ebit = safe_float(income_stmt.loc['EBIT', col]) if 'EBIT' in income_stmt.index else safe_float(income_stmt.loc['Pretax Income', col])
                             tax_prov = safe_float(income_stmt.loc['Tax Provision', col]) if 'Tax Provision' in income_stmt.index else 0
                             nopat = ebit - tax_prov
                             
                             equity = safe_float(balance_sheet.loc['Total Stockholder Equity', col]) if 'Total Stockholder Equity' in balance_sheet.index else safe_float(balance_sheet.loc['Common Stock Equity', col])
                             debt = safe_float(balance_sheet.loc['Total Debt', col]) if 'Total Debt' in balance_sheet.index else 0
                             cash = safe_float(balance_sheet.loc['Cash And Cash Equivalents', col]) if 'Cash And Cash Equivalents' in balance_sheet.index else 0
                             
                             inv_cap = equity + debt - cash
                             if inv_cap > 0:
                                 roic_val = (nopat / inv_cap) * 100
                         except:
                             pass
                     rec["roic"] = roic_val

                     # Historical Valuation Multiples
                     # Need price at fiscal year end
                     price_at_fy = get_price_at_date(price_history, col)
                     if price_at_fy > 0:
                         total_debt = 0
                         cash_equiv = 0
                         if balance_sheet is not None and col in balance_sheet.columns:
                              if 'Total Debt' in balance_sheet.index: total_debt = safe_float(balance_sheet.loc['Total Debt', col])
                              if 'Cash And Cash Equivalents' in balance_sheet.index: cash_equiv = safe_float(balance_sheet.loc['Cash And Cash Equivalents', col])
                         
                         market_cap_hist = price_at_fy * shares_hist
                         enterprise_value_hist = market_cap_hist + total_debt - cash_equiv
                         
                         rec["peRatio"] = (price_at_fy / rec["eps"]) if rec["eps"] > 0 else 0
                         rec["psRatio"] = (market_cap_hist / rev) if rev > 0 else 0
                         rec["evEbitda"] = (enterprise_value_hist / ebitda_val) if ebitda_val > 0 else 0
                         rec["evFcf"] = (enterprise_value_hist / fcf_val) if fcf_val > 0 else 0
                         rec["fcfYield"] = (fcf_val / market_cap_hist * 100) if (market_cap_hist > 0 and fcf_val > 0) else 0

                     # Revenue Growth
                     if i > 0:
                         prev_col = cols[i-1]
                         prev_rev = safe_float(income_stmt.loc['Total Revenue', prev_col])
                         if prev_rev > 0:
                             rec["revenueGrowth"] = ((rev - prev_rev) / prev_rev) * 100
                         else:
                             rec["revenueGrowth"] = 0
                     else:
                         rec["revenueGrowth"] = 0

                     hist_records.append(rec)
                 except Exception as e:
                     debug(f"Error processing historical year {col}: {e}")
                     pass
        
        # Append TTM Record
        if ttm_financials["revenue"] > 0:
            try:
                # Calculate TTM FCF
                ttm_fcf = 0
                if q_cash is not None:
                     ocf_ttm = calculate_ttm(q_cash, "Operating Cash Flow")
                     capex_ttm = calculate_ttm(q_cash, "Capital Expenditure")
                     ttm_fcf = ocf_ttm + capex_ttm # Capex negative usually

                # TTM Revenue Growth - comparison to last FY is misleading due to seasonality/timeframe overlap
                # Better to show N/A or gap in chart
                # Better to show N/A or gap in chart
                ttm_growth = 0 

                # Calculate TTM ROIC
                ttm_roic = 0
                try:
                    if q_income is not None and not q_income.empty:
                        ttm_ebit = calculate_ttm(q_income, "EBIT")
                        if ttm_ebit == 0: ttm_ebit = calculate_ttm(q_income, "Pretax Income")
                        
                        ttm_tax = calculate_ttm(q_income, "Tax Provision")
                        ttm_nopat = ttm_ebit - ttm_tax
                        
                        # Invested Capital (Latest Snapshot)
                        if q_balance is not None and not q_balance.empty:
                            lq = q_balance.columns[0]
                            eq = safe_float(q_balance.loc['Total Stockholder Equity', lq]) if 'Total Stockholder Equity' in q_balance.index else safe_float(q_balance.loc['Common Stock Equity', lq])
                            debt = safe_float(q_balance.loc['Total Debt', lq]) if 'Total Debt' in q_balance.index else 0
                            cash = safe_float(q_balance.loc['Cash And Cash Equivalents', lq]) if 'Cash And Cash Equivalents' in q_balance.index else 0
                            
                            inv_cap = eq + debt - cash
                            if inv_cap > 0:
                                ttm_roic = (ttm_nopat / inv_cap) * 100
                except:
                    pass

                # Define ttm_rec dictionary
                ttm_rec = {
                    "year": fiscal_info["ttm_label"] if fiscal_info else "TTM",
                    "revenue": ttm_financials["revenue"] / 1e6,
                    "grossProfit": ttm_financials["gross_profit"] / 1e6,
                    "grossMargin": ttm_financials["gross_margin_pct"],
                    "netIncome": ttm_financials["net_income"] / 1e6,
                    "netIncomeMargin": (ttm_financials["net_income"] / ttm_financials["revenue"] * 100) if ttm_financials["revenue"] else 0,
                    "eps": ttm_financials["eps"],
                    "ebitda": ttm_financials["ebitda"] / 1e6,
                    "ebitdaMargin": (ttm_financials["ebitda"] / ttm_financials["revenue"] * 100) if ttm_financials["revenue"] else 0,
                    "fcf": ttm_fcf / 1e6,
                    "fcfMargin": (ttm_fcf / ttm_financials["revenue"] * 100) if ttm_financials["revenue"] else 0,
                    "roic": ttm_roic,
                    "revenueGrowth": 0, # TTM vs last FY is not apples-to-apples for growth rate display
                    
                    # Valuation Multiples - Initial Defaults (will be updated below)
                    "peRatio": market_data["pe_ratio"],
                    "psRatio": 0,
                    "evEbitda": 0,
                    "evFcf": 0,
                    "fcfYield": (ttm_fcf / market_data["market_cap"] * 100) if (market_data["market_cap"] and ttm_fcf) else 0
                } 

                # Prepare result - MERGE into existing result object instead of overwriting
                result["financials"] = {
                    "revenue": ttm_financials["revenue"] / 1e6,
                    "grossMargin": ttm_financials["gross_margin_pct"],
                    "ebitda": ttm_financials["ebitda"] / 1e6,
                    "ebitdaMargin": (ttm_financials["ebitda"] / ttm_financials["revenue"] * 100) if ttm_financials["revenue"] else 0,
                    "netIncome": ttm_financials["net_income"] / 1e6,
                    "netIncomeMargin": (ttm_financials["net_income"] / ttm_financials["revenue"] * 100) if ttm_financials["revenue"] else 0,
                    "eps": ttm_financials["eps"],
                    # IMPORTANT: Export Cash Flow Components for TTM Recalculation
                    "freeCashFlow": ttm_fcf / 1e6 if ttm_fcf else 0,
                    "fcf": ttm_fcf / 1e6 if ttm_fcf else 0, # Alias
                    "operatingCashFlow": ocf_ttm / 1e6 if ocf_ttm else 0,
                    "capitalExpenditures": capex_ttm / 1e6 if capex_ttm else 0,
                    # Valuation Ratios (Snapshot)
                    "peRatio": market_data["pe_ratio"],
                    "fcfYield": (ttm_fcf / market_data["market_cap"] * 100) if (market_data["market_cap"] and ttm_fcf) else 0,
                    "marketCap": market_data["market_cap"] / 1e6,
                    "enterpriseValue": market_data["enterprise_value"] / 1e6,
                    "currentPrice": market_data["current_price"],
                    "roic": ttm_roic
                }
                
                # Duplicate for legacy compatibility
                result["yfinanceData"] = { 
                    "revenue": ttm_financials["revenue"] / 1e6,
                    "grossMargin": ttm_financials["gross_margin_pct"],
                    "ebitda": ttm_financials["ebitda"] / 1e6,
                    "netIncome": ttm_financials["net_income"] / 1e6,
                    "eps": ttm_financials["eps"],
                    "marketCap": market_data["market_cap"] / 1e6,
                    "currentPrice": market_data["current_price"],
                    "shares_outstanding": shares_outstanding,
                    "peRatio": market_data["pe_ratio"],
                    "source": "yfinance_api"
                }

                if market_data["market_cap"] > 0 and ttm_financials["revenue"] > 0:
                     ttm_rec["psRatio"] = market_data["market_cap"] / ttm_financials["revenue"]
                     result["financials"]["psRatio"] = ttm_rec["psRatio"]

                # EV/EBITDA TTM
                if q_balance is not None and not q_balance.empty:
                      # Get latest quarter column
                      latest_q = q_balance.columns[0]
                      debt_q = safe_float(q_balance.loc['Total Debt', latest_q]) if 'Total Debt' in q_balance.index else 0
                      cash_q = safe_float(q_balance.loc['Cash And Cash Equivalents', latest_q]) if 'Cash And Cash Equivalents' in q_balance.index else 0
                      
                      mc = market_data["market_cap"]
                      ev = mc + debt_q - cash_q
                      market_data["enterprise_value"] = ev # Update generic market data too
                      result["financials"]["enterpriseValue"] = ev / 1e6 # Update in financials too
                      
                      if ttm_financials["ebitda"] > 0:
                           ttm_rec["evEbitda"] = ev / ttm_financials["ebitda"]
                           result["financials"]["evEbitda"] = ttm_rec["evEbitda"]
                      if ttm_fcf > 0:
                           ttm_rec["evFcf"] = ev / ttm_fcf
                           result["financials"]["evFcf"] = ttm_rec["evFcf"]
                
                # Ensure Company Name is accurate in final result
                result["companyName"] = ticker

                hist_records.append(ttm_rec)
            except Exception as e:
                debug(f"Error appending TTM record: {e}")

        # Sort oldest to newest
        result["historical_financials"] = sorted(hist_records, key=lambda x: str(x['year']))

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



def fetch_historical_valuation(ticker):
    """Fetch 5 years of quarterly valuation data (TTM based)."""
    try:
        debug(f"Fetching historical valuation data for {ticker}...")
        
        # 1. Fetch 5+ years of monthly price data
        # We need enough history to cover the 5y chart
        try:
            # Add delay before API call
            time.sleep(0.3)
            hist = yf.download(ticker, period="10y", interval="1mo", progress=False, ignore_tz=True)
        except Exception:
            hist = None

        if hist is None or hist.empty:
            debug("No historical price data found")
            return []

        # 2. Fetch quarterly financials
        company = yf.Ticker(ticker)
        
        q_inc = company.quarterly_income_stmt
        q_bal = company.quarterly_balance_sheet
        q_cash = company.quarterly_cash_flow
        
        if q_inc is None or q_inc.empty:
            debug("No quarterly income data found")
            return []

        # Fetch Annual CF for Backup
        a_cash = company.cash_flow

        # Get Shares from balance sheet (avoid company.info API call for rate limiting)
        shares = 0
        try:
            shares = safe_float(company.fast_info.get('shares', 0))
        except:
            pass
            
        # Helper: Get Price at Date
        def get_price_at_date(df, target_date):
            if df is None or df.empty: return 0
            # Convert index to datetime if needed
            index_dt = pd.to_datetime(df.index)
            # Find closest index
            # Use searchsorted?
            # Simplest: difference
            try:
                # Ensure target_date is tz-naive if index is
                if index_dt.tz is not None: index_dt = index_dt.tz_localize(None)
                
                # Find closest index
                # This works for finding the month-end close closest to quarter-end
                idx_pos = index_dt.searchsorted(target_date)
                if idx_pos >= len(df): idx_pos = len(df) - 1
                
                # Check adjacent
                dt_at = index_dt[idx_pos]
                val = df['Close'].iloc[idx_pos]
                if isinstance(val, pd.Series): val = val.iloc[0]
                return safe_float(val)
            except:
                return 0

        # Helper: Calculate TTM from Quarterly DF
        def calculate_ttm_at_date(df, end_date, row_name):
            if df is None or df.empty: return 0
            # Get columns (dates)
            cols = [pd.to_datetime(c) for c in df.columns]
            # Filter cols <= end_date
            valid_cols = [c for c in cols if c <= end_date]
            valid_cols.sort(reverse=True) # Newest first
            
            # We need exact 4 quarters
            last_4 = valid_cols[:4]
            if len(last_4) < 4: return 0
            
            # Check if they are contiguous? (Assume roughly 3 month gaps)
            # Just sum them for now
            total = 0
            for date_col in last_4:
                # Find matching column name in original df (might be string vs timestamp mismatch)
                # Re-map back to string if needed or use index
                # yfinance df columns are Timestamps usually
                try:
                    # In recent pandas/yfinance, columns are Timestamps
                    val = df.loc[row_name, date_col]
                    total += safe_float(val)
                except:
                    pass
            return total

        # Helper: Get Balance Sheet Item at Date (Point in Time)
        def get_bs_at_date(df, end_date, row_name):
             if df is None or df.empty: return 0
             cols = [pd.to_datetime(c) for c in df.columns]
             valid_cols = [c for c in cols if c <= end_date]
             valid_cols.sort(reverse=True)
             if not valid_cols: return 0
             latest = valid_cols[0]
             try:
                 return safe_float(df.loc[row_name, latest]) 
             except:
                 return 0

        # Iterate over Income Statement Columns (Quarters)
        results = []
        cols = [pd.to_datetime(c) for c in q_inc.columns]
        cols.sort() # Oldest to newest
        
        # Filter to last 5 years
        # start_date = pd.Timestamp.now() - pd.DateOffset(years=5)
        # cols = [c for c in cols if c >= start_date]

        for q_date in cols:
            try:
                # 1. TTM Metrics
                rev_ttm = calculate_ttm_at_date(q_inc, q_date, "Total Revenue")
                ni_ttm  = calculate_ttm_at_date(q_inc, q_date, "Net Income")
                eps_val = calculate_ttm_at_date(q_inc, q_date, "Diluted EPS")
                if eps_val == 0 and shares > 0: eps_val = ni_ttm / shares
                
                ebitda_ttm = 0
                if 'EBITDA' in q_inc.index:
                    ebitda_ttm = calculate_ttm_at_date(q_inc, q_date, "EBITDA")
                elif 'Normalized EBITDA' in q_inc.index:
                    ebitda_ttm = calculate_ttm_at_date(q_inc, q_date, "Normalized EBITDA")

                fcf_ttm = 0
                if q_cash is not None:
                     # Try Direct FCF first if available in quarterly
                     fcf_ttm = calculate_ttm_at_date(q_cash, q_date, "Free Cash Flow")
                if q_cash is not None and fcf_ttm == 0: # Only try OCF+CapEx if direct FCF is 0
                     # 1. Try TTM from Quarterly OCF+CapEx
                     ocf = calculate_ttm_at_date(q_cash, q_date, "Operating Cash Flow")
                     capex = calculate_ttm_at_date(q_cash, q_date, "Capital Expenditure")
                     fcf_ttm = ocf + capex

                # 2. WORKAROUND: Fallback to Annual FCF if Quarterly failed
                if fcf_ttm == 0 and a_cash is not None and not a_cash.empty:
                    # Find annual report column where date is close to q_date (within 6 months?)
                    # If q_date is 2023-09-30, and Annual is 2023-12-31, use that.
                    try:
                        a_cols = [pd.to_datetime(c) for c in a_cash.columns]
                        # Find closest date
                        closest_date = min(a_cols, key=lambda d: abs(d - q_date))
                        # If closest is within 365 days, use it
                        if abs((closest_date - q_date).days) < 370:
                             # Get FCF from Annual
                             val = 0
                             if 'Free Cash Flow' in a_cash.index:
                                 val = safe_float(a_cash.loc['Free Cash Flow', closest_date])
                             elif 'Operating Cash Flow' in a_cash.index and 'Capital Expenditure' in a_cash.index:
                                 val = safe_float(a_cash.loc['Operating Cash Flow', closest_date]) + safe_float(a_cash.loc['Capital Expenditure', closest_date])
                             
                             fcf_ttm = val # Use Annual as Proxy for TTM
                    except:
                        pass
                
                # WORKAROUND: Fallback to Annual FCF if Quarterly failed
                # User specifically asked for workarounds to populate the chart
                if fcf_ttm == 0:
                    try:
                        # Fetch/Use Annual Cash Flow (lazy load if not already)
                        # We don't have it passed in, need to access company.cash_flow which might be slow?
                        # Actually we instantiated 'company' above (line 568).
                        # Let's assume 'company.cash_flow' is fast enough or cached by yfinance lib
                        
                        # We need to find the Annual Column closest to q_date
                        # Since we are inside a loop, let's not call .cash_flow every time.
                        # We should have fetched it once outside.
                        # Refactor: move .cash_flow fetch up.
                        pass # See MultiReplace below
                    except:
                        pass
                
                # 2. Valuation Logic
                price = get_price_at_date(hist, q_date)
                
                # Shares at that time? Hard to get historical shares accurately without full BS history.
                # Use current shares as proxy if historical missing, or try BS
                shares_hist = get_bs_at_date(q_bal, q_date, "Ordinary Shares Number")
                if shares_hist == 0: shares_hist = get_bs_at_date(q_bal, q_date, "Common Stock Shares Outstanding")
                if shares_hist == 0: shares_hist = shares # Fallback
                
                if price == 0 or shares_hist == 0: continue
                
                market_cap = price * shares_hist
                
                # Enterprise Value
                debt = get_bs_at_date(q_bal, q_date, "Total Debt")
                cash = get_bs_at_date(q_bal, q_date, "Cash And Cash Equivalents")
                ev = market_cap + debt - cash
                
                # 3. Ratios
                rec = {
                    "date": q_date.strftime('%Y-%m-%d'),
                    "price": price,
                    "peRatio": (price / eps_val) if eps_val > 0 else 0,
                    "psRatio": (market_cap / rev_ttm) if rev_ttm > 0 else 0,
                    "evEbitda": (ev / ebitda_ttm) if ebitda_ttm > 0 else 0,
                    "evFcf": (ev / fcf_ttm) if fcf_ttm > 0 else 0,
                    "fcfYield": (fcf_ttm / market_cap * 100) if (market_cap > 0 and fcf_ttm > 0) else 0
                }
                
                results.append(rec)
            except Exception as e:
                pass # Skip bad quarters

        return results
    except Exception as e:
        debug(f"Error fetching historical valuation: {e}")
        return []

if __name__ == "__main__":
    if len(sys.argv) < 2:
        debug(json.dumps({"error": "Usage: python fetch_yfinance.py <TICKER> [MODE]"}))
        sys.exit(1)
    
    ticker = sys.argv[1].upper()
    mode = sys.argv[2] if len(sys.argv) > 2 else "standard"
    
    if mode == "--valuation":
        # Import pandas inside to avoid slowing down standard calls if not needed (though it's at top level anyway)
        import pandas as pd
        result = fetch_historical_valuation(ticker)
        print(json.dumps(result, allow_nan=False))
    else:
        result = fetch_financials(ticker)
        print(json.dumps(result, allow_nan=False))
 