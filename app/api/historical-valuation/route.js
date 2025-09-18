import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export async function POST(request) {
  try {
    const { ticker, years = 5 } = await request.json();

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching historical valuation data for ${ticker}...`);

    // Fetch historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - years);

    const historicalData = await fetchHistoricalValuationData(ticker, startDate, endDate);
    
    if (!historicalData || historicalData.length === 0) {
      return NextResponse.json(
        { error: 'No historical valuation data found for the provided ticker' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      data: historicalData,
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        years: years
      }
    });

  } catch (error) {
    console.error('Historical valuation error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical valuation data: ' + error.message },
      { status: 500 }
    );
  }
}

async function fetchHistoricalValuationData(ticker, startDate, endDate) {
  try {
    // Fetch historical price data
    const priceData = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1mo' // Monthly data for better performance
    });

    if (!priceData || priceData.length === 0) {
      return [];
    }

    // Fetch quarterly financial data
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['incomeStatementHistoryQuarterly', 'balanceSheetHistory', 'cashflowStatementHistory', 'defaultKeyStatistics']
    });

    if (!quote) {
      return [];
    }

    const incomeHistory = quote.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const balanceHistory = quote.balanceSheetHistory?.balanceSheetHistory || [];
    const cashflowHistory = quote.cashflowStatementHistory?.cashflowStatementHistory || [];
    const keyStats = quote.defaultKeyStatistics || {};

    // Process quarterly data and align with monthly price data
    const valuationData = processValuationData(priceData, incomeHistory, balanceHistory, cashflowHistory, keyStats);
    
    return valuationData;

  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error);
    return [];
  }
}

function calculateTTM(quarterlyData, priceDate, field) {
  // Get the last 4 quarters of data for TTM calculation
  const quarters = Array.from(quarterlyData.entries())
    .filter(([key, data]) => {
      const dataDate = new Date(data.endDate);
      return dataDate <= priceDate;
    })
    .sort((a, b) => new Date(b[1].endDate) - new Date(a[1].endDate))
    .slice(0, 4);
  
  // Sum the field values from the last 4 quarters
  return quarters.reduce((sum, [key, data]) => {
    return sum + (data[field] || 0);
  }, 0);
}

function processValuationData(priceData, incomeHistory, balanceHistory, cashflowHistory, keyStats = {}) {
  const valuationData = [];
  
  // Create a map of quarterly data by date
  const quarterlyData = new Map();
  
  // Process income statements
  incomeHistory.forEach(income => {
    const date = new Date(income.endDate);
    const year = date.getFullYear();
    const quarter = Math.floor((date.getMonth() + 3) / 3);
    const key = `${year}-Q${quarter}`;
    
    quarterlyData.set(key, {
      ...quarterlyData.get(key),
      revenue: income.totalRevenue || 0,
      netIncome: income.netIncome || 0,
      ebitda: income.ebitda || 0,
      grossProfit: income.grossProfit || 0,
      operatingIncome: income.operatingIncome || 0,
      sharesOutstanding: income.sharesOutstanding || 0,
      endDate: income.endDate
    });
  });

  // Process balance sheets
  balanceHistory.forEach(balance => {
    const date = new Date(balance.endDate);
    const year = date.getFullYear();
    const quarter = Math.floor((date.getMonth() + 3) / 3);
    const key = `${year}-Q${quarter}`;
    
    quarterlyData.set(key, {
      ...quarterlyData.get(key),
      totalAssets: balance.totalAssets || 0,
      totalDebt: balance.totalDebt || 0,
      totalEquity: balance.totalStockholderEquity || 0,
      cash: balance.cash || 0,
      endDate: balance.endDate
    });
  });

  // Process cash flow statements
  cashflowHistory.forEach(cashflow => {
    const date = new Date(cashflow.endDate);
    const year = date.getFullYear();
    const quarter = Math.floor((date.getMonth() + 3) / 3);
    const key = `${year}-Q${quarter}`;
    
    quarterlyData.set(key, {
      ...quarterlyData.get(key),
      operatingCashFlow: cashflow.totalCashFromOperatingActivities || 0,
      freeCashFlow: (cashflow.totalCashFromOperatingActivities || 0) + (cashflow.capitalExpenditures || 0),
      endDate: cashflow.endDate
    });
  });

  // Align monthly price data with quarterly financial data
  priceData.forEach((pricePoint, index) => {
    const priceDate = new Date(pricePoint.date);
    const year = priceDate.getFullYear();
    const month = priceDate.getMonth() + 1;
    
    // Find the most recent quarterly data before this price point
    let latestQuarterlyData = null;
    let latestQuarter = null;
    
    for (const [key, data] of quarterlyData.entries()) {
      const [dataYear, dataQuarter] = key.split('-Q').map(Number);
      const dataDate = new Date(data.endDate);
      
      if (dataDate <= priceDate && (!latestQuarterlyData || dataDate > new Date(latestQuarterlyData.endDate))) {
        latestQuarterlyData = data;
        latestQuarter = key;
      }
    }

    if (latestQuarterlyData && latestQuarterlyData.revenue > 0) {
      // Calculate market cap using current price and shares outstanding
      const sharesOutstanding = keyStats.sharesOutstanding || 0;
      
      if (!sharesOutstanding || sharesOutstanding <= 0) {
        console.log(`No shares outstanding available for ${pricePoint.date}, skipping...`);
        return;
      }
      
      const marketCap = pricePoint.close * sharesOutstanding;
      
      // Calculate trailing twelve months (TTM) by getting the last 4 quarters
      const ttmRevenue = calculateTTM(quarterlyData, priceDate, 'revenue');
      const ttmNetIncome = calculateTTM(quarterlyData, priceDate, 'netIncome');
      
      // Calculate EPS (Earnings Per Share) = TTM Net Income / Shares Outstanding
      const ttmEps = sharesOutstanding > 0 ? ttmNetIncome / sharesOutstanding : 0;
      
      // Calculate valuation metrics
      const peRatio = ttmEps > 0 ? pricePoint.close / ttmEps : null;
      const psRatio = ttmRevenue > 0 ? marketCap / ttmRevenue : null;
      
      
      valuationData.push({
        date: pricePoint.date,
        price: pricePoint.close,
        marketCap: marketCap,
        peRatio: peRatio,
        psRatio: psRatio,
        revenue: ttmRevenue,
        netIncome: ttmNetIncome,
        quarter: latestQuarter
      });
    }
  });

  // Sort by date and return only the last 20 data points for performance
  return valuationData
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-20);
}
