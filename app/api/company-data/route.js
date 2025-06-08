import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    // Call the Python serverless function
    const response = await fetch(
      `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/fetch_company_data?ticker=${ticker}`,
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
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch company data',
      details: error.message
    }, { status: 500 });
  }
}