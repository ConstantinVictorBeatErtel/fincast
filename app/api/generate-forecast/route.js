import { NextResponse } from 'next/server';

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
    const historicalResponse = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/company-data?ticker=${encodeURIComponent(ticker)}`
    );
    const historicalData = await historicalResponse.json();

    if (!historicalResponse.ok) {
      throw new Error(historicalData.error || 'Failed to fetch historical data');
    }

    // Prepare the prompt for Claude
    const prompt = `Based on the following historical financial data for ${ticker}, please provide a detailed 5-year forecast for Revenue, Gross Profit, EBIT, Net Income, and Free Cash Flow. Historical Data: ${JSON.stringify(historicalData)}. Please analyze this data along with industry trends, company position, and market conditions. Provide your forecast in a structured JSON format with yearly predictions and brief explanations for each metric.`;

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
      throw new Error(error.error?.message || 'Failed to generate forecast');
    }

    const data = await response.json();
    const forecastText = data.content[0].text;
    
    // Extract the JSON from Claude's response
    const jsonMatch = forecastText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      throw new Error('Failed to parse forecast data');
    }

    const forecast = JSON.parse(jsonMatch[1]);
    return NextResponse.json(forecast);
  } catch (error) {
    console.error('Error generating forecast:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate forecast' },
      { status: 500 }
    );
  }
} 