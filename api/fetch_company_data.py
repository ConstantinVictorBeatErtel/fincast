# @vercel/python@3.0.0
from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Add the virtual environment's site-packages to the Python path
venv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'venv')
site_packages = os.path.join(venv_path, 'lib', 'python3.12', 'site-packages')
if os.path.exists(site_packages):
    sys.path.insert(0, site_packages)

# Now import simfin
import simfin as sf
from simfin.names import *

# Set your API-key for downloading data.
sf.set_api_key('1aab9692-30b6-4b82-be79-27d454de3b25')

# Set the local directory where data-files are stored.
data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
os.makedirs(data_dir, exist_ok=True)
sf.set_data_dir(data_dir)

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
        return {'error': str(e)}

def handler(request):
    # Get ticker from query string
    ticker = request.args.get('ticker', '')

    if not ticker:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Ticker is required'})
        }

    try:
        data = fetch_company_data(ticker)
        return {
            'statusCode': 200,
            'body': json.dumps(data)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        } 