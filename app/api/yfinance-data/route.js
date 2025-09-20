import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
    }

    console.log(`Fetching data for ${ticker}...`);

    try {
      // Fetch current quote data
      const quote = await yahooFinance.quoteSummary(ticker, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics']
      });

      const currentPrice = quote.price?.regularMarketPrice || 0;
      const marketCap = quote.summaryDetail?.marketCap || 0;
      const sharesOutstanding = quote.defaultKeyStatistics?.sharesOutstanding || 0;

      // Fetch historical data for the last 5 years
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 5);

      const historical = await yahooFinance.historical(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });

      // Process historical data
      const historicalData = historical.map(day => ({
        date: day.date.toISOString().split('T')[0],
        close: day.close,
        volume: day.volume
      }));

      return NextResponse.json({
        ticker: ticker,
        currentPrice: currentPrice,
        marketCap: marketCap,
        sharesOutstanding: sharesOutstanding,
        historicalData: historicalData,
        dataPoints: historicalData.length
      });

    } catch (yfError) {
      console.error(`Yahoo Finance error for ${ticker}:`, yfError.message);
      
      // Fallback: Return basic data structure
      return NextResponse.json({
        ticker: ticker,
        currentPrice: 100,
        marketCap: 1000000,
        sharesOutstanding: 10000000,
        historicalData: [],
        dataPoints: 0,
        error: `Failed to fetch data for ${ticker}: ${yfError.message}`
      });
    }

  } catch (error) {
    console.error('Error in yfinance-data route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
