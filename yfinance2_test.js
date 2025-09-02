// Import the NextResponse object from Next.js for sending responses
import { NextResponse } from 'next/server';
// Import the yahoo-finance2 library
import yahooFinance from 'yahoo-finance2';

/**
 * This is an API route handler for GET requests.
 * When a request is made to /api, this function will execute.
 * Vercel automatically handles setting this up as a serverless function.
 */
export async function GET(request) {
  // You can get the ticker from the URL query, e.g., /api?ticker=GOOG
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  // If no ticker is provided in the URL, return an error
  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required. Try /api?ticker=AAPL' },
      { status: 400 } // Bad Request
    );
  }

  try {
    // Fetch the quote data for the specified ticker
    const quote = await yahooFinance.quote(ticker);

    // If the quote doesn't contain a market price, the ticker is likely invalid
    if (!quote || !quote.regularMarketPrice) {
        return NextResponse.json(
            { error: `Invalid ticker symbol: ${ticker}` },
            { status: 404 } // Not Found
        );
    }

    // Return the fetched quote data as a JSON response
    return NextResponse.json(quote);

  } catch (error) {
    // Log the error for debugging purposes on the server
    console.error(`Error fetching data for ${ticker}:`, error);

    // Return a generic server error response
    return NextResponse.json(
      { error: 'Failed to fetch financial data.' },
      { status: 500 } // Internal Server Error
    );
  }
}
