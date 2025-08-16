import json
import yfinance as yf

def handler(request):
    """Minimal Vercel Python runtime handler"""
    try:
        # Get ticker from query parameters
        ticker = None
        
        # Try to get ticker from the request
        if hasattr(request, 'query'):
            ticker = request.query.get('ticker')
        elif hasattr(request, 'args'):
            ticker = request.args.get('ticker')
        elif hasattr(request, 'get'):
            ticker = request.get('ticker')
        
        if not ticker:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Missing ticker parameter'})
            }
        
        # Simple test - just get basic info
        company = yf.Ticker(ticker)
        info = company.info
        
        # Return basic company info as a test
        result = {
            'ticker': ticker,
            'name': info.get('longName', 'Unknown'),
            'current_price': info.get('currentPrice', 0),
            'market_cap': info.get('marketCap', 0),
            'currency': info.get('currency', 'USD'),
            'test': 'Python route is working'
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'type': type(e).__name__,
                'test': 'Python route error'
            })
        }
