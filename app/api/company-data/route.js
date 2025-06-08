import { NextResponse } from 'next/server';

const SIMFIN_API_KEY = '1aab9692-30b6-4b82-be79-27d454de3b25';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    // Fetch data directly from SimFin API
    const response = await fetch(
      `https://backend.simfin.com/api/v3/companies/statements/income-statement?ticker=${ticker}&period=annual&api-key=${SIMFIN_API_KEY}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform the data into the expected format
    const result = {};
    data.forEach(item => {
      if (item.reportDate) {
        const year = new Date(item.reportDate).getFullYear();
        result[year] = {
          'Revenue': item.revenue || 0,
          'Net Income': item.netIncome || 0
        };
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch company data',
      details: error.message
    }, { status: 500 });
  }
}