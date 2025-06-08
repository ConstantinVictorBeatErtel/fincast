# @vercel/python@3.0.0
# Vercel Python serverless function for fetching company data
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import requests

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
        # Fetch data directly from SimFin API
        api_key = '1aab9692-30b6-4b82-be79-27d454de3b25'
        
        # First get company ID
        lookup_url = f'https://backend.simfin.com/api/v3/companies/lookup?ticker={ticker}&api-key={api_key}'
        lookup_response = requests.get(lookup_url)
        lookup_response.raise_for_status()
        company_data = lookup_response.json()
        
        if not company_data:
            return {'error': 'Company not found'}
            
        company_id = company_data[0]['simId']
        
        # Then get financial statements
        statements_url = f'https://backend.simfin.com/api/v3/companies/{company_id}/statements/income-statement?period=annual&api-key={api_key}'
        statements_response = requests.get(statements_url)
        statements_response.raise_for_status()
        statements_data = statements_response.json()
        
        # Transform the data
        result = {}
        for item in statements_data:
            if item.get('reportDate'):
                year = item['reportDate'][:4]  # Extract year from date
                result[year] = {
                    'Revenue': item.get('revenue', 0),
                    'Net Income': item.get('netIncome', 0)
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