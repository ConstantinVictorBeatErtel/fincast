
import sys
import os

# Add current directory to path so we can import scripts
sys.path.append(os.getcwd())

from scripts.fetch_yfinance import fetch_financials

print("Starting reproduction...")
try:
    data = fetch_financials('ADBE')
    print("Fetch completed.")
except Exception as e:
    print(f"Caught exception: {e}")
