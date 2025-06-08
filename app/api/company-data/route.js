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

  if (!process.env.TIINGO_API_KEY) {
    console.error('TIINGO_API_KEY is not set');
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch financial statements
    const statementsResponse = await fetch(
      `https://api.tiingo.com/tiingo/fundamentals/${ticker}/statements?token=${process.env.TIINGO_API_KEY}`,
      {
        headers: {
          'Authorization': `Token ${process.env.TIINGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!statementsResponse.ok) {
      const errorText = await statementsResponse.text();
      console.error('Tiingo API Error:', {
        status: statementsResponse.status,
        statusText: statementsResponse.statusText,
        body: errorText
      });
      throw new Error(`Failed to fetch financial statements: ${statementsResponse.status} ${statementsResponse.statusText}`);
    }

    const statements = await statementsResponse.json();

    // Fetch company info for dividend yield
    const infoResponse = await fetch(
      `https://api.tiingo.com/tiingo/daily/${ticker}?token=${process.env.TIINGO_API_KEY}`,
      {
        headers: {
          'Authorization': `Token ${process.env.TIINGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!infoResponse.ok) {
      const errorText = await infoResponse.text();
      console.error('Tiingo API Error:', {
        status: infoResponse.status,
        statusText: infoResponse.statusText,
        body: errorText
      });
      throw new Error(`Failed to fetch company info: ${infoResponse.status} ${infoResponse.statusText}`);
    }

    const companyInfo = await infoResponse.json();

    // Process and format the data
    const processedData = statements.map(statement => {
      // Calculate Free Cash Flow
      const operatingCashFlow = statement.cashFlowStatement?.operatingCashFlow || 0;
      const capitalExpenditure = statement.cashFlowStatement?.capitalExpenditure || 0;
      const freeCashFlow = operatingCashFlow - Math.abs(capitalExpenditure);

      // Calculate ROIC
      const netIncome = statement.incomeStatement?.netIncome || 0;
      const totalAssets = statement.balanceSheet?.totalAssets || 0;
      const totalLiabilities = statement.balanceSheet?.totalLiabilities || 0;
      const investedCapital = totalAssets - totalLiabilities;
      const roic = investedCapital !== 0 ? (netIncome / investedCapital) * 100 : 0;

      return {
        date: statement.date,
        revenue: statement.incomeStatement?.revenue || 0,
        netIncome: netIncome,
        freeCashFlow: freeCashFlow,
        roic: roic,
      };
    });

    // Calculate TTM values
    const ttmValues = processedData.slice(0, 4).reduce((acc, curr) => {
      acc.revenue += curr.revenue;
      acc.netIncome += curr.netIncome;
      acc.freeCashFlow += curr.freeCashFlow;
      return acc;
    }, { revenue: 0, netIncome: 0, freeCashFlow: 0 });

    // Calculate TTM ROIC
    const latestStatement = statements[0];
    const ttmNetIncome = ttmValues.netIncome;
    const ttmInvestedCapital = (latestStatement.balanceSheet?.totalAssets || 0) - 
                             (latestStatement.balanceSheet?.totalLiabilities || 0);
    const ttmRoic = ttmInvestedCapital !== 0 ? (ttmNetIncome / ttmInvestedCapital) * 100 : 0;

    return NextResponse.json({
      historicalData: processedData,
      ttmMetrics: {
        revenue: ttmValues.revenue,
        netIncome: ttmValues.netIncome,
        freeCashFlow: ttmValues.freeCashFlow,
        roic: ttmRoic,
        dividendYield: companyInfo.dividendYield || 0
      }
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