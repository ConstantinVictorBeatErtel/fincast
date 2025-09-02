import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const periodParam = (searchParams.get('period') || 'annual').toLowerCase();
  const period = periodParam === 'quarterly' ? 'quarterly' : 'annual';

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required. Try /api/financials?ticker=AAPL&period=annual' },
      { status: 400 }
    );
  }

  try {
    const modules = [
      'incomeStatementHistory',
      'balanceSheetHistory',
      'cashflowStatementHistory',
      'incomeStatementHistoryQuarterly',
      'balanceSheetHistoryQuarterly',
      'cashflowStatementHistoryQuarterly',
    ];

    const result = await yahooFinance.quoteSummary(ticker, { modules });

    const income = period === 'annual'
      ? result?.incomeStatementHistory?.incomeStatementHistory || []
      : result?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

    const balance = period === 'annual'
      ? result?.balanceSheetHistory?.balanceSheetStatements || []
      : result?.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];

    const cashflow = period === 'annual'
      ? result?.cashflowStatementHistory?.cashflowStatements || []
      : result?.cashflowStatementHistoryQuarterly?.cashflowStatements || [];

    // If all are empty, likely invalid ticker or data unavailable
    if ((!income?.length) && (!balance?.length) && (!cashflow?.length)) {
      return NextResponse.json(
        { error: `Financial statements unavailable for ${ticker} (${period}).` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ticker,
      period,
      incomeStatement: income,
      balanceSheet: balance,
      cashflow,
    });
  } catch (error) {
    console.error(`Error fetching financials for ${ticker}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch financial statements.' },
      { status: 500 }
    );
  }
}


