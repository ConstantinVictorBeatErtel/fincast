import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

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
    // Fetch financial data from Yahoo Finance
    const [incomeStatement, balanceSheet, cashFlow] = await Promise.all([
      yahooFinance.incomeStatement(ticker, { period1: '2020-01-01' }),
      yahooFinance.balanceSheet(ticker, { period1: '2020-01-01' }),
      yahooFinance.cashFlow(ticker, { period1: '2020-01-01' })
    ]);

    // Process historical data
    const historicalData = incomeStatement.map((quarter, index) => ({
      date: quarter.endDate,
      revenue: quarter.totalRevenue / 1e6, // Convert to millions
      netIncome: quarter.netIncome / 1e6,
      freeCashFlow: (cashFlow[index]?.freeCashFlow || 0) / 1e6,
      roic: calculateROIC(
        quarter.netIncome,
        balanceSheet[index]?.totalStockholderEquity || 0,
        balanceSheet[index]?.totalLiab || 0
      )
    }));

    // Calculate TTM metrics
    const ttmMetrics = calculateTTM(historicalData);

    // Generate simple commentary based on trends
    const commentary = generateCommentary(historicalData);

    return NextResponse.json({
      historicalData,
      ttmMetrics,
      commentary
    });
  } catch (error) {
    console.error('Error fetching company data:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch company data',
        details: error.stack
      },
      { status: 500 }
    );
  }
}

function calculateROIC(netIncome, equity, debt) {
  const investedCapital = equity + debt;
  if (!investedCapital) return 0;
  return netIncome / investedCapital;
}

function calculateTTM(data) {
  if (data.length < 4) return null;

  const last4Quarters = data.slice(-4);
  return {
    revenue: last4Quarters.reduce((sum, q) => sum + q.revenue, 0),
    netIncome: last4Quarters.reduce((sum, q) => sum + q.netIncome, 0),
    freeCashFlow: last4Quarters.reduce((sum, q) => sum + q.freeCashFlow, 0),
    roic: last4Quarters.reduce((sum, q) => sum + q.roic, 0) / 4,
    dividendYield: 0 // Would need to fetch from dividend history
  };
}

function generateCommentary(data) {
  const revenueGrowth = calculateGrowthRate(data.map(d => d.revenue));
  const netIncomeGrowth = calculateGrowthRate(data.map(d => d.netIncome));
  const fcfGrowth = calculateGrowthRate(data.map(d => d.freeCashFlow));

  const lastYear = new Date().getFullYear();
  const commentary = {};

  for (let i = 1; i <= 5; i++) {
    const year = lastYear + i;
    commentary[year] = `Projected growth based on historical performance: Revenue ${(revenueGrowth * 100).toFixed(1)}%, Net Income ${(netIncomeGrowth * 100).toFixed(1)}%, FCF ${(fcfGrowth * 100).toFixed(1)}%`;
  }

  return commentary;
}

function calculateGrowthRate(values) {
  if (values.length < 2) return 0.1;
  const first = values[0];
  const last = values[values.length - 1];
  const years = values.length / 4;
  const growthRate = Math.pow(last / first, 1 / years) - 1;
  return Math.max(-0.2, Math.min(0.5, growthRate));
}