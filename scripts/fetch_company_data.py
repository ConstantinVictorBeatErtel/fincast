import os
import sys
import json

# Add the virtual environment's site-packages to the Python path
venv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'venv')
site_packages = os.path.join(venv_path, 'lib', 'python3.12', 'site-packages')
sys.path.insert(0, site_packages)

# Now import simfin
import simfin as sf
from simfin.names import *

# Set your API-key for downloading data.
sf.set_api_key('1aab9692-30b6-4b82-be79-27d454de3b25')

# Set the local directory where data-files are stored.
sf.set_data_dir('/tmp/simfin_data/')

def fetch_company_data(ticker):
    try:
        # Load the annual Income Statements for all companies in the US.
        df = sf.load_income(variant='annual', market='us')

        # Get data for the specified ticker
        data = df.loc[ticker, [REVENUE, NET_INCOME]]
        result = {}
        for idx, row in data.iterrows():
            result[str(idx)] = {
                'Revenue': float(row[REVENUE]),
                'Net Income': float(row[NET_INCOME])
            }

        return result
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Ticker symbol is required'}))
        sys.exit(1)

    ticker = sys.argv[1]
    try:
        data = fetch_company_data(ticker)
        print(json.dumps(data))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1) 

