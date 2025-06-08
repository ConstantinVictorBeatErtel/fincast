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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  try {
    // First, get historical data
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';

    console.log('Fetching historical data from:', `${baseUrl}/api/company-data?ticker=${ticker}`);

    const historicalResponse = await fetch(
      `${baseUrl}/api/company-data?ticker=${encodeURIComponent(ticker)}`
    );

    // Log the response status and headers
    console.log('Historical data response status:', historicalResponse.status);
    console.log('Historical data response headers:', Object.fromEntries(historicalResponse.headers.entries()));

    // Get the response text first to check if it's valid JSON
    const responseText = await historicalResponse.text();
    console.log('Historical data response text:', responseText);

    let historicalData;
    try {
      historicalData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse historical data response:', parseError);
      throw new Error(`Invalid JSON response from historical data API: ${responseText.substring(0, 200)}...`);
    }

    if (!historicalResponse.ok) {
      throw new Error(historicalData.error || 'Failed to fetch historical data');
    }

    // Prepare the prompt for Claude
    const prompt = `Based on the following historical financial data for ${ticker}, please provide a detailed 5-year forecast for Revenue, Net Income, Free Cash Flow, and ROIC. Historical Data: ${JSON.stringify(historicalData)}. Please analyze this data along with industry trends, company position, and market conditions. Provide your forecast in a structured JSON format with yearly predictions and brief explanations for each metric. The response should be in the following format:

{
  "forecast": [
    {
      "year": "2024",
      "revenue": number,
      "netIncome": number,
      "freeCashFlow": number,
      "roic": number,
      "explanation": "Brief explanation of the forecast for this year"
    },
    // ... repeat for each year
  ]
}`;

    console.log('Calling Claude API with prompt length:', prompt.length);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error:', error);
      throw new Error(error.error?.message || 'Failed to generate forecast');
    }

    const data = await response.json();
    const forecastText = data.content[0].text;
    
    // Extract the JSON from Claude's response
    const jsonMatch = forecastText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.error('Failed to find JSON in Claude response:', forecastText);
      throw new Error('Failed to parse forecast data');
    }

    const forecast = JSON.parse(jsonMatch[1]);
    return NextResponse.json(forecast.forecast);
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