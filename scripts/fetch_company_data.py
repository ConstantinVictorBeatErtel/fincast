import simfin as sf
from simfin.names import *
import pandas as pd
import json
import os

# Set API key
sf.set_api_key('392e2398-fac4-4eba-af9e-dcda63d71d30')

# Set the local directory where data files are stored
sf.set_data_dir('~/simfin_data/')

# Create directory to store JSON outputs
json_output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../fincast/data')
os.makedirs(json_output_dir, exist_ok=True)

# Default tickers to fetch
tickers = ['AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'NVDA', 'JNJ', 'WMT']

try:
    print("Loading financial data...")
    # Load financial statements
    income_annual = sf.load_income(variant='annual', market='us')
    balance_annual = sf.load_balance(variant='annual', market='us')
    prices = sf.load_shareprices(market='us', variant='daily')

    # Print available columns for debugging
    print("\nAvailable columns in income statement:")
    print(income_annual.columns.tolist())
    print("\nAvailable columns in balance sheet:")
    print(balance_annual.columns.tolist())
    print("\nAvailable columns in prices:")
    print(prices.columns.tolist())

    # Process each ticker
    for ticker in tickers:
        print(f"\nProcessing {ticker}...")
        try:
            # Check if ticker exists in the data
            if ticker not in income_annual.index:
                print(f"Ticker {ticker} not found in income statement data")
                continue
            if ticker not in balance_annual.index:
                print(f"Ticker {ticker} not found in balance sheet data")
                continue
            if ticker not in prices.index:
                print(f"Ticker {ticker} not found in price data")
                continue

            # Get latest income statement data
            income_data = income_annual.loc[ticker].sort_index(ascending=False).iloc[0]
            balance_data = balance_annual.loc[ticker].sort_index(ascending=False).iloc[0]
            price_data = prices.loc[ticker].sort_index(ascending=False).iloc[0]

            # Create company metrics with correct column names
            company_data = {
                "Symbol": ticker,
                "Revenue": float(income_data.get('Revenue', 0)),
                "NetIncome": float(income_data.get('Net Income', 0)),
                "GrossProfit": float(income_data.get('Gross Profit', 0)),
                "OperatingIncome": float(income_data.get('Operating Income (Loss)', 0)),
                "TotalAssets": float(balance_data.get('Total Assets', 0)),
                "TotalLiabilities": float(balance_data.get('Total Liabilities', 0)),
                "TotalEquity": float(balance_data.get('Total Equity', 0)),
                "Price": float(price_data.get('Close', 0)),
                "Volume": int(price_data.get('Volume', 0)),
                "Date": pd.Timestamp.now().strftime("%Y-%m-%d")
            }

            # Calculate market cap from price and shares
            shares_outstanding = float(balance_data.get('Shares (Basic)', 0))
            if shares_outstanding > 0:
                company_data["MarketCapitalization"] = company_data["Price"] * shares_outstanding

            # Calculate ratios
            if company_data["Revenue"] > 0:
                company_data["ProfitMargin"] = company_data["NetIncome"] / company_data["Revenue"]
                company_data["GrossMargin"] = company_data["GrossProfit"] / company_data["Revenue"]
                company_data["OperatingMargin"] = company_data["OperatingIncome"] / company_data["Revenue"]

            # Calculate P/E ratio
            if company_data["NetIncome"] > 0 and shares_outstanding > 0:
                eps = company_data["NetIncome"] / shares_outstanding
                if eps > 0:
                    company_data["PERatio"] = company_data["Price"] / eps

            # Save company metrics
            metrics_file = os.path.join(json_output_dir, f"{ticker}_metrics.json")
            with open(metrics_file, 'w') as f:
                json.dump(company_data, f, indent=2)
            print(f"Saved metrics to {metrics_file}")

            # Save historical prices (last 30 days)
            if ticker != 'SPY':  # Skip for SPY as it's handled separately
                historical_prices = prices.loc[ticker].sort_index(ascending=False).head(30)
                price_history = {
                    "Meta Data": {
                        "1. Information": "Daily Prices",
                        "2. Symbol": ticker,
                        "3. Last Refreshed": historical_prices.index[0].strftime("%Y-%m-%d")
                    },
                    "Time Series (Daily)": {}
                }

                for date, row in historical_prices.iterrows():
                    date_str = date.strftime("%Y-%m-%d")
                    price_history["Time Series (Daily)"][date_str] = {
                        "1. open": float(row.get('Open', 0)),
                        "2. high": float(row.get('High', 0)),
                        "3. low": float(row.get('Low', 0)),
                        "4. close": float(row.get('Close', 0)),
                        "5. volume": int(row.get('Volume', 0))
                    }

                prices_file = os.path.join(json_output_dir, f"{ticker}_prices.json")
                with open(prices_file, 'w') as f:
                    json.dump(price_history, f, indent=2)
                print(f"Saved price history to {prices_file}")

        except Exception as e:
            print(f"Error processing {ticker}: {str(e)}")
            continue

    # Create market data from SPY
    try:
        if 'SPY' in prices.index:
            spy_prices = prices.loc['SPY'].sort_index(ascending=False).head(2)
            if len(spy_prices) >= 2:
                latest = spy_prices.iloc[0]
                previous = spy_prices.iloc[1]
                
                market_data = {
                    "Global Quote": {
                        "01. symbol": "SPY",
                        "02. open": float(latest.get('Open', 0)),
                        "03. high": float(latest.get('High', 0)),
                        "04. low": float(latest.get('Low', 0)),
                        "05. price": float(latest.get('Close', 0)),
                        "06. volume": int(latest.get('Volume', 0)),
                        "07. latest trading day": spy_prices.index[0].strftime("%Y-%m-%d"),
                        "08. previous close": float(previous.get('Close', 0)),
                        "09. change": float(latest.get('Close', 0) - previous.get('Close', 0)),
                        "10. change percent": f"{((latest.get('Close', 0) - previous.get('Close', 0)) / previous.get('Close', 0) * 100):.4f}%"
                    }
                }

                market_file = os.path.join(json_output_dir, "market_data.json")
                with open(market_file, 'w') as f:
                    json.dump(market_data, f, indent=2)
                print(f"\nSaved market data to {market_file}")
        else:
            print("SPY not found in price data")

    except Exception as e:
        print(f"Error creating market data: {str(e)}")

    print("\nData fetch completed successfully!")

except Exception as e:
    print(f"Error fetching data: {str(e)}") 

