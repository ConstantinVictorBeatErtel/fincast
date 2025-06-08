import { NextResponse } from 'next/server';

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

export async function POST(request) {
  try {
    const { ticker, historicalData } = await request.json();

    if (!ticker || !historicalData) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    // Prepare the prompt for Claude
    const prompt = `Based on the following historical financial data for ${ticker}, please provide a detailed 5-year forecast for:
1. Revenue
2. Gross Profit
3. EBIT
4. Net Income
5. Free Cash Flow

Historical Data:
${JSON.stringify(historicalData, null, 2)}

Please analyze this data along with:
- Industry trends
- Company's competitive position
- Recent company announcements
- Analyst commentary
- Market conditions

Provide your forecast in a structured JSON format with yearly predictions and brief explanations for each metric.`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to generate forecast');
    }

    // Parse Claude's response
    const forecastData = JSON.parse(result.content[0].text);
    
    return NextResponse.json({ forecast: forecastData });
  } catch (error) {
    console.error('Error generating forecast:', error);
    return NextResponse.json({ 
      error: 'Failed to generate forecast',
      details: error.message
    }, { status: 500 });
  }
} 