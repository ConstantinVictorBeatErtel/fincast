# @vercel/python@3.0.0
# Vercel Python serverless function for fetching company data
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import requests
from datetime import datetime, timedelta

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
        # Tiingo API configuration
        api_key = 'd11699709a38e4ed2e7ea88cc5fd4268e34a1f28'
        headers = {
            'Authorization': f'Token {api_key}',
            'Content-Type': 'application/json'
        }

        # Calculate date range (last 5 years)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=5*365)  # 5 years ago
        
        # Format dates for API
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')

        # Fetch financial statements
        url = f'https://api.tiingo.com/tiingo/fundamentals/{ticker}/statements?startDate={start_date_str}&endDate={end_date_str}&format=json'
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        statements_data = response.json()

        # Transform the data
        result = {}
        for statement in statements_data:
            if statement.get('date'):
                year = statement['date'][:4]  # Extract year from date
                result[year] = {
                    'Revenue': statement.get('revenue', 0),
                    'Net Income': statement.get('netIncome', 0)
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