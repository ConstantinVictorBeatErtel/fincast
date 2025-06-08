import { NextResponse } from 'next/server';

const TIINGO_API_KEY = 'd11699709a38e4ed2e7ea88cc5fd4268e34a1f28';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    // Calculate date range (last 5 years)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);

    // Format dates for API
    const formatDate = (date) => date.toISOString().split('T')[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Fetch financial statements from Tiingo
    const response = await fetch(
      `https://api.tiingo.com/tiingo/fundamentals/${ticker}/statements?startDate=${startDateStr}&endDate=${endDateStr}&format=json`,
      {
        headers: {
          'Authorization': `Token ${TIINGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Tiingo API error: ${response.status}`);
    }

    const statements = await response.json();

    // Transform the data
    const result = {};
    for (const statement of statements) {
      if (statement.date && statement.statementData && statement.statementData.incomeStatement) {
        const year = statement.date.substring(0, 4);
        const incomeStatement = statement.statementData.incomeStatement;
        
        // Find revenue and net income values
        const revenue = incomeStatement.find(item => item.dataCode === 'revenue')?.value || 0;
        const netIncome = incomeStatement.find(item => item.dataCode === 'netinc')?.value || 0;

        result[year] = {
          'Revenue': revenue,
          'Net Income': netIncome
        };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch company data',
      details: error.message
    }, { status: 500 });
  }
}