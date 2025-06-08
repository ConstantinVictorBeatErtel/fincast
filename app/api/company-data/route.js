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
    const url = `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${API_KEY}`;
    
    console.log('Fetching from URL:', url);
    const response = await fetch(url);
    
    // Check if response is ok before trying to parse JSON
    if (!response.ok) {
      console.error('API response not ok:', response.status, response.statusText);
      return new Response(JSON.stringify({ 
        error: `API request failed with status ${response.status}` 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the response text first to check if it's valid JSON
    const text = await response.text();
    console.log('Raw API response:', text.substring(0, 200) + '...'); // Log first 200 chars

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON response from API' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (data['Error Message']) {
      console.error('API error message:', data['Error Message']);
      return new Response(JSON.stringify({ error: data['Error Message'] }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!data.quarterlyReports || !data.quarterlyReports.length) {
      console.error('No quarterly reports found for ticker:', ticker);
      return new Response(JSON.stringify({ 
        error: `No quarterly reports found for ticker ${ticker}` 
      }), {
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

    console.log('Processed result:', result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in API route:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 