import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  if (!process.env.TIINGO_API_KEY) {
    console.error('TIINGO_API_KEY is not set');
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
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
          'Authorization': `Token ${process.env.TIINGO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tiingo API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Tiingo API error: ${response.status} - ${errorText}`);
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