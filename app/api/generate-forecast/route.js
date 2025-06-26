import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required' },
      { status: 400 }
    );
  }

  try {
    // First, get historical data
    const requestUrl = new URL(request.url);
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : `${requestUrl.protocol}//${requestUrl.host}`;

    const historicalResponse = await fetch(
      `${baseUrl}/api/company-data?ticker=${encodeURIComponent(ticker)}`
    );

    const historicalData = await historicalResponse.json();

    if (!historicalResponse.ok) {
      throw new Error(historicalData.error || 'Failed to fetch historical data');
    }

    // Calculate forecast based on historical data
    const lastYear = new Date().getFullYear();
    const forecast = [];

    // Get growth rates from historical data
    const revenueGrowth = calculateGrowthRate(historicalData.historicalData.map(d => d.revenue));
    const netIncomeGrowth = calculateGrowthRate(historicalData.historicalData.map(d => d.netIncome));
    const fcfGrowth = calculateGrowthRate(historicalData.historicalData.map(d => d.freeCashFlow));

    // Generate 5-year forecast
    for (let i = 1; i <= 5; i++) {
      const year = lastYear + i;
      const prevYear = year - 1;
      
      const prevYearData = i === 1 
        ? historicalData.ttmMetrics 
        : forecast[i - 2];

      forecast.push({
        date: year.toString(),
        revenue: Math.round(prevYearData.revenue * (1 + revenueGrowth)),
        netIncome: Math.round(prevYearData.netIncome * (1 + netIncomeGrowth)),
        freeCashFlow: Math.round(prevYearData.freeCashFlow * (1 + fcfGrowth)),
        roic: prevYearData.roic,
        commentary: `Projected growth based on historical performance and market trends.`
      });
    }

    return NextResponse.json(forecast);
  } catch (error) {
    console.error('Error generating forecast:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate forecast',
        details: error.stack
      },
      { status: 500 }
    );
  }
}

function calculateGrowthRate(values) {
  if (values.length < 2) return 0.1; // Default to 10% if not enough data
  
  // Calculate compound annual growth rate
  const first = values[0];
  const last = values[values.length - 1];
  const years = values.length / 4; // Assuming quarterly data
  
  const growthRate = Math.pow(last / first, 1 / years) - 1;
  
  // Cap growth rate between -20% and 50%
  return Math.max(-0.2, Math.min(0.5, growthRate));
} 