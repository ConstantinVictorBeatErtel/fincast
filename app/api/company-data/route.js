import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker symbol is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Direct call to Alpha Vantage API
    const API_KEY = 'P7M6C5PE71GNLCKN';
    const response = await fetch(
      `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${API_KEY}`
    );
    
    const data = await response.json();

    if (data['Error Message']) {
      return new Response(JSON.stringify({ error: data['Error Message'] }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!data.quarterlyReports || !data.quarterlyReports.length) {
      return new Response(JSON.stringify({ error: `No quarterly reports found for ticker ${ticker}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the most recent quarter's data
    const latestQuarter = data.quarterlyReports[0];
    const fiscalDate = latestQuarter.fiscalDateEnding.split('-');
    
    const result = {
      ticker: ticker.toUpperCase(),
      revenue: parseFloat(latestQuarter.totalRevenue),
      net_income: parseFloat(latestQuarter.netIncome),
      quarter: fiscalDate[1],
      year: fiscalDate[0]
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 