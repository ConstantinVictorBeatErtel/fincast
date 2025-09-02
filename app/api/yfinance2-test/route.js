// Import the NextResponse object from Next.js for sending responses
import { NextResponse } from 'next/server';
// Import the yahoo-finance2 library
import yahooFinance from 'yahoo-finance2';

/**
 * This is an API route handler for GET requests.
 * When a request is made to /api/yfinance2-test, this function will execute.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required. Try /api/yfinance2-test?ticker=AAPL' },
      { status: 400 }
    );
  }

  try {
    const quote = await yahooFinance.quote(ticker);

    if (!quote || !quote.regularMarketPrice) {
      return NextResponse.json(
        { error: `Invalid ticker symbol: ${ticker}` },
        { status: 404 }
      );
    }

    return NextResponse.json(quote);
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data.' },
      { status: 500 }
    );
  }
}


