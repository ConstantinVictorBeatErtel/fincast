import json
import yfinance as yf


def handler(request):
    """Root Python Serverless Function for Vercel at /api/yfinance-data"""
    try:
        ticker = None

        # Support multiple request styles
        if hasattr(request, 'args') and request.args:
            ticker = request.args.get('ticker')
        if not ticker and hasattr(request, 'query') and request.query:
            ticker = request.query.get('ticker')
        if not ticker and hasattr(request, 'get'):
            ticker = request.get('ticker')

        if not ticker:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Missing ticker parameter'})
            }

        company = yf.Ticker(ticker)
        info = company.info or {}

        result = {
            'ticker': ticker,
            'name': info.get('longName') or info.get('shortName') or ticker,
            'current_price': info.get('currentPrice', 0) or info.get('regularMarketPrice', 0) or 0,
            'market_cap': info.get('marketCap', 0) or 0,
            'currency': info.get('currency', 'USD') or 'USD',
            'source': 'yfinance',
        }

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(result)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e), 'type': type(e).__name__})
        }


