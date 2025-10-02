"""
Vercel serverless function for yfinance data fetching.
This wraps the existing fetch_yfinance.py script.
"""
import sys
import json
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.fetch_yfinance import fetch_financials


def handler(request):
    """Vercel serverless function handler."""
    try:
        # Get ticker from query params
        ticker = request.args.get('ticker')

        if not ticker:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Ticker parameter is required'})
            }

        # Fetch the data
        data = fetch_financials(ticker)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400'
            },
            'body': json.dumps(data)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to fetch data',
                'message': str(e)
            })
        }
