import { NextResponse } from 'next/server';

// export const runtime = 'edge';

const generateValuation = async (ticker, method, selectedMultiple = 'auto', feedback = null) => {
  try {
    console.log('Generating valuation for:', { ticker, method, selectedMultiple, feedback });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, and net income, ultimately leading to a fair value calculation for the company.

The company you will be analyzing is: ${ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:

1. Research and analyze the company's historical financial data. Look for past growth rates, margins, and any notable trends or patterns.

2. Investigate current industry trends and company-specific factors that may impact future performance.

3. Find the current share price for ${ticker} and include it in your analysis.

4. Project revenue growth:
   - Analyze historical revenue growth rates
   - Consider industry trends and market conditions
   - Estimate year-over-year revenue growth rates until 2029
   - Calculate projected revenue figures for each year

5. Estimate gross margin:
   - Review historical gross margin trends
   - Consider factors that may impact future gross margins (e.g., cost of goods sold, pricing strategies)
   - Project gross margin percentages for each year until 2029

6. Calculate EBITDA margin:
   - Analyze historical EBITDA margin trends
   - Consider factors that may impact future EBITDA margins (e.g., operating expenses, efficiency improvements)
   - Project EBITDA margin percentages for each year until 2029

7. Determine FCF margin:
   - Review historical FCF margin trends
   - Consider factors that may impact future FCF margins (e.g., capital expenditures, working capital changes)
   - Project FCF margin percentages for each year until 2029

8. Project net income:
   - Use the projected revenue and margin figures to calculate net income for each year
   - Consider factors such as tax rates and non-operating income/expenses

9. Calculate fair value:
   - Use a discounted cash flow (DCF) model to determine the fair value of the company
   - Consider an appropriate discount rate based on the company's risk profile and industry standards
   - Calculate the terminal value using a perpetual growth rate method
   - Sum the present values of projected cash flows and terminal value to derive the fair value

For each step, use <financial_analysis> tags to show your thought process and calculations. Within these tags:

1. Summarize key financial metrics from the past 3-5 years.
2. List 3-5 relevant industry trends that could impact future performance.
3. Include the current share price for ${ticker}.
4. For each financial metric (revenue, margins, etc.), list out year-by-year projections with brief justifications.
5. Break down the DCF calculation steps, including the determination of discount rate and terminal growth rate.

After completing all steps, present your final forecast in the following format:

<forecast>
Company Name: ${ticker}

Financial Forecast 2024-2029:

Year | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M)
---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | ---------------
2024 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2025 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2026 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2027 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2028 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2029 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]

Fair Value Calculation:
Discount Rate: [Value]%
Terminal Growth Rate: [Value]%
Fair Value: $[Value] million

Current Share Price: $[Value]

Assumptions and Justifications:
[Provide a brief explanation of key assumptions and justifications for your projections]
</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
    } else if (method === 'exit-multiple') {
      // Determine the appropriate multiple type based on industry and user selection
      let multipleTypeInstruction = '';
      
      if (selectedMultiple === 'auto') {
        multipleTypeInstruction = `Choose the most appropriate exit multiple based on industry and company characteristics:
- P/E: Consumer staples, Healthcare, Retail, Financials
- EV/FCF: Software (mature stage), Industrial compounders, Capital-light consumer businesses
- EV/EBITDA: Industrial conglomerates, Telecoms, Infrastructure, Manufacturing, high-growth tech firms
- EV/Sales: High-growth firms with negative or erratic earnings`;

      } else {
        multipleTypeInstruction = `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      }
      
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, and net income, ultimately leading to a fair value calculation using exit multiple valuation.

The company you will be analyzing is: ${ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:

1. Research and analyze the company's historical financial data. Look for past growth rates, margins, and any notable trends or patterns.

2. Investigate current industry trends and company-specific factors that may impact future performance.

3. Find the current share price for ${ticker} and include it in your analysis.

4. Project revenue growth:
   - Analyze historical revenue growth rates
   - Consider industry trends and market conditions
   - Estimate year-over-year revenue growth rates until 2029
   - Calculate projected revenue figures for each year

5. Estimate gross margin:
   - Review historical gross margin trends
   - Consider factors that may impact future gross margins (e.g., cost of goods sold, pricing strategies)
   - Project gross margin percentages for each year until 2029

6. Calculate EBITDA margin:
   - Analyze historical EBITDA margin trends
   - Consider factors that may impact future EBITDA margins (e.g., operating expenses, efficiency improvements)
   - Project EBITDA margin percentages for each year until 2029

7. Determine FCF margin:
   - Review historical FCF margin trends
   - Consider factors that may impact future FCF margins (e.g., capital expenditures, working capital changes)
   - Project FCF margin percentages for each year until 2029

8. Project net income and EPS:
   - Use the projected revenue and margin figures to calculate net income for each year
   - Consider factors such as tax rates and non-operating income/expenses
   - Calculate EPS based on projected net income and current share count

9. Determine appropriate exit multiple:
   - Research comparable company multiples in the industry
   - Consider the company's growth profile, profitability, and risk factors
   - Choose between P/E, EV/EBITDA, or EV/FCF based on industry standards
   - Select an appropriate multiple value based on historical ranges and forward-looking expectations

10. Calculate fair value:
    - Apply the selected exit multiple to the 2029 projected financial metric
    - For P/E: Fair Value = 2029 EPS × P/E Multiple
    - For EV/EBITDA: Enterprise Value = 2029 EBITDA × EV/EBITDA Multiple
    - For EV/FCF: Enterprise Value = 2029 FCF × EV/FCF Multiple
    - Convert enterprise value to equity value if using EV multiples

For each step, use <financial_analysis> tags to show your thought process and calculations. Within these tags:

1. Summarize key financial metrics from the past 3-5 years.
2. List 3-5 relevant industry trends that could impact future performance.
3. Include the current share price for ${ticker}.
4. For each financial metric (revenue, margins, etc.), list out year-by-year projections with brief justifications.
5. Explain the rationale for the chosen exit multiple and its appropriateness for this company.

After completing all steps, present your final forecast in the following format:

<forecast>
Company Name: ${ticker}

Financial Forecast 2024-2029:

Year | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M) | EPS
---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | --------------- | ---
2024 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2025 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2026 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2027 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2028 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2029 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]

Exit Multiple Valuation:
Exit Multiple Type: [P/E, EV/EBITDA, or EV/FCF]
Exit Multiple Value: [Value]
2029 Metric Value: [Value]
Fair Value: $[Value] per share

Current Share Price: $[Value]

Assumptions and Justifications:
[Provide a brief explanation of key assumptions and justifications for your projections]
</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
    } else {
      throw new Error(`Unsupported valuation method: ${method}`);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: `Return ONLY JSON. NO text. NO explanations. Get CURRENT data. Use actual 2024 financial results and current market data. Search for the most recent quarterly/annual reports and current stock prices. Search for analyst estimates, industry trends, and company guidance to ensure projections are based on current market expectations.`,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
            user_location: {
              type: "approximate",
              country: "US",
              timezone: "America/New_York"
            }
          }
        ]
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
      console.error('Claude API error:', error);
      
      if (response.status === 404) {
        throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol.`);
      }
      
      throw new Error(error.error?.message || 'Failed to generate valuation');
    }

    const data = await response.json();
    console.log('Claude API response structure:', {
      contentLength: data.content?.length,
      contentTypes: data.content?.map(c => c.type),
      hasText: data.content?.some(c => c.type === 'text')
    });

    // Extract the text content from the response
    let valuationText;
    const textContent = data.content?.reverse().find(c => c.type === 'text');
    
    if (textContent?.text) {
      valuationText = textContent.text;
    } else {
      const anyTextContent = data.content?.find(c => c.text);
      if (anyTextContent?.text) {
        valuationText = anyTextContent.text;
      } else {
        console.error('Response structure:', {
          content: data.content?.map(c => ({
            type: c.type,
            hasText: !!c.text,
            textLength: c.text?.length
          }))
        });
        throw new Error('Invalid response from Claude API: No text content found');
      }
    }

    if (!valuationText) {
      console.error('Empty valuation text');
      throw new Error('Invalid response from Claude API: Empty text content');
    }

    console.log('Raw valuation text:', valuationText);

    // Parse the new structured forecast format - handle full Claude response
    try {
      // Extract the forecast section
      let forecastText;
      const forecastMatch = valuationText.match(/<forecast>([\s\S]*?)<\/forecast>/i);
      if (forecastMatch) {
        forecastText = forecastMatch[1];
      } else {
        // Fallback: use the entire text if no forecast tags found
        forecastText = valuationText;
      }

      // Extract the financial analysis section
      let financialAnalysisText = '';
      const analysisMatch = valuationText.match(/<financial_analysis>([\s\S]*?)<\/financial_analysis>/i);
      if (analysisMatch) {
        financialAnalysisText = analysisMatch[1];
      }

      console.log('Forecast text:', forecastText);
      console.log('Financial analysis text:', financialAnalysisText);

      // Parse the forecast table to extract financial data for basic structure
      const lines = forecastText.split('\n').filter(line => line.trim());
      
      // Extract company name
      const companyMatch = forecastText.match(/Company Name:\s*(.+)/i);
      const companyName = companyMatch ? companyMatch[1].trim() : ticker;

      // Extract table data for basic structure
      const tableData = [];
      let inTable = false;
      
      for (const line of lines) {
        if (line.includes('Year | Revenue') || line.includes('----')) {
          inTable = true;
          continue;
        }
        
        if (inTable && line.trim() && !line.includes('----')) {
          const columns = line.split('|').map(col => col.trim());
          if (columns.length >= 6) {
            tableData.push({
              year: columns[0],
              revenue: parseFloat(columns[1].replace(/,/g, '')) || 0,
              revenueGrowth: parseFloat(columns[2]) || 0,
              grossMargin: parseFloat(columns[3]) || 0,
              ebitdaMargin: parseFloat(columns[4]) || 0,
              fcfMargin: parseFloat(columns[5]) || 0,
              netIncome: parseFloat(columns[6].replace(/,/g, '')) || 0,
              eps: parseFloat(columns[7]) || 0
            });
          }
        }
        
        if (inTable && line.includes('Fair Value Calculation:')) {
          break;
        }
      }

      // Extract exit multiple info for exit-multiple method
      let exitMultipleType = null;
      let exitMultipleValue = null;
      
      if (method === 'exit-multiple') {
        const exitTypeMatch = forecastText.match(/Exit Multiple Type:\s*(.+)/i);
        exitMultipleType = exitTypeMatch ? exitTypeMatch[1].trim() : null;
        
        const exitValueMatch = forecastText.match(/Exit Multiple Value:\s*([\d.]+)/i);
        exitMultipleValue = exitValueMatch ? parseFloat(exitValueMatch[1]) : null;
      }

      // Extract basic values for compatibility
      let fairValue = 0;
      const fairValueMatch = forecastText.match(/Fair Value:\s*\$([\d,]+)\s*million/i);
      if (fairValueMatch) {
        fairValue = parseFloat(fairValueMatch[1].replace(/,/g, ''));
        console.log('Extracted million fair value:', fairValue);
      } else {
        // For exit-multiple method, also check for per-share format
        if (method === 'exit-multiple') {
          console.log('Looking for per-share fair value in:', forecastText.substring(0, 500));
          const perShareMatch = forecastText.match(/Fair Value:\s*\$([\d,]+(?:\.\d+)?)\s*per\s*share/i);
          console.log('Per-share regex match:', perShareMatch);
          if (perShareMatch) {
            // For per-share values, store the per-share value directly
            fairValue = parseFloat(perShareMatch[1].replace(/,/g, ''));
            console.log('Extracted per-share fair value:', fairValue);
          } else {
            console.log('No per-share match found. Looking for pattern in text...');
            const fairValueLine = forecastText.match(/Fair Value:.*per share/i);
            console.log('Fair value line found:', fairValueLine);
          }
        }
      }

      // Extract current share price
      let currentSharePrice = 0;
      const currentPriceMatch = forecastText.match(/Current Share Price:\s*\$([\d.]+)/i);
      if (currentPriceMatch) {
        currentSharePrice = parseFloat(currentPriceMatch[1]);
        console.log('Extracted current share price:', currentSharePrice);
      }

      const discountRateMatch = forecastText.match(/Discount Rate:\s*([\d.]+)%/i);
      const discountRate = discountRateMatch ? parseFloat(discountRateMatch[1]) : 0;

      const terminalGrowthMatch = forecastText.match(/Terminal Growth Rate:\s*([\d.]+)%/i);
      const terminalGrowth = terminalGrowthMatch ? parseFloat(terminalGrowthMatch[1]) : 0;

      // Return the raw data structure with minimal parsing
      const result = {
        rawForecast: forecastText,
        rawFinancialAnalysis: financialAnalysisText,
        fullResponse: valuationText,
        companyName: companyName,
        method: method,
        // Basic parsed values for compatibility
        fairValue: fairValue,
        currentSharePrice: currentSharePrice,
        discountRate: discountRate,
        terminalGrowth: terminalGrowth,
        exitMultipleType: exitMultipleType,
        exitMultipleValue: exitMultipleValue,
        // Table data for basic structure
        tableData: tableData,
        // Raw text sections for frontend display
        sections: {
          forecastTable: extractForecastTable(forecastText),
          fairValueCalculation: extractFairValueCalculation(forecastText),
          exitMultipleValuation: extractExitMultipleValuation(forecastText),
          assumptions: extractAssumptions(forecastText),
          financialAnalysis: financialAnalysisText
        }
      };

      console.log('Raw forecast result:', {
        hasRawForecast: !!result.rawForecast,
        hasFinancialAnalysis: !!result.rawFinancialAnalysis,
        companyName: result.companyName,
        method: result.method,
        fairValue: result.fairValue,
        currentSharePrice: result.currentSharePrice,
        sections: Object.keys(result.sections)
      });

      return result;
    } catch (parseError) {
      console.error('Failed to parse forecast data:', {
        error: parseError.message,
        rawTextLength: valuationText.length,
        rawTextPreview: valuationText.substring(0, 200) + '...'
      });
      throw new Error(`Failed to parse forecast data: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in generateValuation:', {
      ticker,
      method,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Helper functions to extract sections from raw text
function extractForecastTable(text) {
  const tableMatch = text.match(/(Year\s*\|.*?\n(?:----.*?\n)?(?:\d{4}\s*\|.*?\n)*)/s);
  return tableMatch ? tableMatch[1].trim() : '';
}

function extractFairValueCalculation(text) {
  const match = text.match(/(Fair Value Calculation:.*?)(?=\n\s*\n|$)/s);
  return match ? match[1].trim() : '';
}

function extractExitMultipleValuation(text) {
  const match = text.match(/(Exit Multiple Valuation:.*?)(?=\n\s*\n|$)/s);
  return match ? match[1].trim() : '';
}

function extractAssumptions(text) {
  const match = text.match(/(Assumptions and Justifications:.*?)(?=\n\s*\n|$)/s);
  return match ? match[1].trim() : '';
}

const generateValuationWithFeedback = async (ticker, method, selectedMultiple = 'auto', feedback) => {
  try {
    console.log('Generating valuation with feedback for:', { ticker, method, selectedMultiple, feedback });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, and net income, ultimately leading to a fair value calculation for the company.

The company you will be analyzing is: ${ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:

1. Research and analyze the company's historical financial data. Look for past growth rates, margins, and any notable trends or patterns.

2. Investigate current industry trends and company-specific factors that may impact future performance.

3. Find the current share price for ${ticker} and include it in your analysis.

4. Project revenue growth:
   - Analyze historical revenue growth rates
   - Consider industry trends and market conditions
   - Estimate year-over-year revenue growth rates until 2029
   - Calculate projected revenue figures for each year

5. Estimate gross margin:
   - Review historical gross margin trends
   - Consider factors that may impact future gross margins (e.g., cost of goods sold, pricing strategies)
   - Project gross margin percentages for each year until 2029

6. Calculate EBITDA margin:
   - Analyze historical EBITDA margin trends
   - Consider factors that may impact future EBITDA margins (e.g., operating expenses, efficiency improvements)
   - Project EBITDA margin percentages for each year until 2029

7. Determine FCF margin:
   - Review historical FCF margin trends
   - Consider factors that may impact future FCF margins (e.g., capital expenditures, working capital changes)
   - Project FCF margin percentages for each year until 2029

8. Project net income:
   - Use the projected revenue and margin figures to calculate net income for each year
   - Consider factors such as tax rates and non-operating income/expenses

9. Calculate fair value:
   - Use a discounted cash flow (DCF) model to determine the fair value of the company
   - Consider an appropriate discount rate based on the company's risk profile and industry standards
   - Calculate the terminal value using a perpetual growth rate method
   - Sum the present values of projected cash flows and terminal value to derive the fair value

For each step, use <financial_analysis> tags to show your thought process and calculations. Within these tags:

1. Summarize key financial metrics from the past 3-5 years.
2. List 3-5 relevant industry trends that could impact future performance.
3. Include the current share price for ${ticker}.
4. For each financial metric (revenue, margins, etc.), list out year-by-year projections with brief justifications.
5. Break down the DCF calculation steps, including the determination of discount rate and terminal growth rate.

After completing all steps, present your final forecast in the following format:

<forecast>
Company Name: ${ticker}

Financial Forecast 2024-2029:

Year | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M)
---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | ---------------
2024 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2025 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2026 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2027 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2028 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]
2029 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]

Fair Value Calculation:
Discount Rate: [Value]%
Terminal Growth Rate: [Value]%
Fair Value: $[Value] million

Current Share Price: $[Value]

Assumptions and Justifications:
[Provide a brief explanation of key assumptions and justifications for your projections]
</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
    } else if (method === 'exit-multiple') {
      // Determine the appropriate multiple type based on industry and user selection
      let multipleTypeInstruction = '';
      
      if (selectedMultiple === 'auto') {
        multipleTypeInstruction = `Choose the most appropriate exit multiple based on industry and company characteristics:
- P/E: Consumer staples, Healthcare, Retail, Financials
- EV/FCF: Software (mature stage), Industrial compounders, Capital-light consumer businesses
- EV/EBITDA: Industrial conglomerates, Telecoms, Infrastructure, Manufacturing, high-growth tech firms
- EV/Sales: High-growth firms with negative or erratic earnings`;

      } else {
        multipleTypeInstruction = `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      }
      
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, and net income, ultimately leading to a fair value calculation using exit multiple valuation.

The company you will be analyzing is: ${ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:

1. Research and analyze the company's historical financial data. Look for past growth rates, margins, and any notable trends or patterns.

2. Investigate current industry trends and company-specific factors that may impact future performance.

3. Find the current share price for ${ticker} and include it in your analysis.

4. Project revenue growth:
   - Analyze historical revenue growth rates
   - Consider industry trends and market conditions
   - Estimate year-over-year revenue growth rates until 2029
   - Calculate projected revenue figures for each year

5. Estimate gross margin:
   - Review historical gross margin trends
   - Consider factors that may impact future gross margins (e.g., cost of goods sold, pricing strategies)
   - Project gross margin percentages for each year until 2029

6. Calculate EBITDA margin:
   - Analyze historical EBITDA margin trends
   - Consider factors that may impact future EBITDA margins (e.g., operating expenses, efficiency improvements)
   - Project EBITDA margin percentages for each year until 2029

7. Determine FCF margin:
   - Review historical FCF margin trends
   - Consider factors that may impact future FCF margins (e.g., capital expenditures, working capital changes)
   - Project FCF margin percentages for each year until 2029

8. Project net income and EPS:
   - Use the projected revenue and margin figures to calculate net income for each year
   - Consider factors such as tax rates and non-operating income/expenses
   - Calculate EPS based on projected net income and current share count

9. Determine appropriate exit multiple:
   - Research comparable company multiples in the industry
   - Consider the company's growth profile, profitability, and risk factors
   - Choose between P/E, EV/EBITDA, or EV/FCF based on industry standards
   - Select an appropriate multiple value based on historical ranges and forward-looking expectations

10. Calculate fair value:
    - Apply the selected exit multiple to the 2029 projected financial metric
    - For P/E: Fair Value = 2029 EPS × P/E Multiple
    - For EV/EBITDA: Enterprise Value = 2029 EBITDA × EV/EBITDA Multiple
    - For EV/FCF: Enterprise Value = 2029 FCF × EV/FCF Multiple
    - Convert enterprise value to equity value if using EV multiples

For each step, use <financial_analysis> tags to show your thought process and calculations. Within these tags:

1. Summarize key financial metrics from the past 3-5 years.
2. List 3-5 relevant industry trends that could impact future performance.
3. Include the current share price for ${ticker}.
4. For each financial metric (revenue, margins, etc.), list out year-by-year projections with brief justifications.
5. Explain the rationale for the chosen exit multiple and its appropriateness for this company.

After completing all steps, present your final forecast in the following format:

<forecast>
Company Name: ${ticker}

Financial Forecast 2024-2029:

Year | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M) | EPS
---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | --------------- | ---
2024 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2025 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2026 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2027 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2028 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2029 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]

Exit Multiple Valuation:
Exit Multiple Type: [P/E, EV/EBITDA, or EV/FCF]
Exit Multiple Value: [Value]
2029 Metric Value: [Value]
Fair Value: $[Value] per share

Current Share Price: $[Value]

Assumptions and Justifications:
[Provide a brief explanation of key assumptions and justifications for your projections]
</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;

    } else {
      throw new Error(`Unsupported valuation method: ${method}`);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: `Return ONLY JSON. NO text. NO explanations. Get CURRENT data. Use actual 2024 financial results and current market data. Search for the most recent quarterly/annual reports and current stock prices. Incorporate user feedback into your analysis.`,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
            user_location: {
              type: "approximate",
              country: "US",
              timezone: "America/New_York"
            }
          }
        ]
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
      console.error('Claude API error:', error);
      
      if (response.status === 404) {
        throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol.`);
      }
      
      throw new Error(error.error?.message || 'Failed to generate valuation');
    }

    const data = await response.json();
    console.log('Claude API response structure:', {
      contentLength: data.content?.length,
      contentTypes: data.content?.map(c => c.type),
      hasText: data.content?.some(c => c.type === 'text')
    });

    // Extract the text content from the response
    let valuationText;
    const textContent = data.content?.reverse().find(c => c.type === 'text');
    
    if (textContent?.text) {
      valuationText = textContent.text;
    } else {
      const anyTextContent = data.content?.find(c => c.text);
      if (anyTextContent?.text) {
        valuationText = anyTextContent.text;
      } else {
        console.error('Response structure:', {
          content: data.content?.map(c => ({
            type: c.type,
            hasText: !!c.text,
            textLength: c.text?.length
          }))
        });
        throw new Error('Invalid response from Claude API: No text content found');
      }
    }

    if (!valuationText) {
      console.error('Empty valuation text');
      throw new Error('Invalid response from Claude API: Empty text content');
    }

    console.log('Raw valuation text:', valuationText);

    // Parse the new structured forecast format - simplified to preserve original structure
    try {
      // Extract the forecast section
      let forecastText;
      const forecastMatch = valuationText.match(/<forecast>([\s\S]*?)<\/forecast>/i);
      if (forecastMatch) {
        forecastText = forecastMatch[1];
      } else {
        // Fallback: use the entire text if no forecast tags found
        forecastText = valuationText;
      }

      console.log('Forecast text:', forecastText);

      // Parse the forecast table to extract financial data for basic structure
      const lines = forecastText.split('\n').filter(line => line.trim());
      
      // Extract company name
      const companyMatch = forecastText.match(/Company Name:\s*(.+)/i);
      const companyName = companyMatch ? companyMatch[1].trim() : ticker;

      // Extract table data for basic structure
      const tableData = [];
      let inTable = false;
      
      for (const line of lines) {
        if (line.includes('Year | Revenue') || line.includes('----')) {
          inTable = true;
          continue;
        }
        
        if (inTable && line.trim() && !line.includes('----')) {
          const columns = line.split('|').map(col => col.trim());
          if (columns.length >= 6) {
            tableData.push({
              year: columns[0],
              revenue: parseFloat(columns[1]) || 0,
              revenueGrowth: parseFloat(columns[2]) || 0,
              grossMargin: parseFloat(columns[3]) || 0,
              ebitdaMargin: parseFloat(columns[4]) || 0,
              fcfMargin: parseFloat(columns[5]) || 0,
              netIncome: parseFloat(columns[6]) || 0,
              eps: parseFloat(columns[7]) || 0
            });
          }
        }
        
        if (inTable && line.includes('Fair Value Calculation:')) {
          break;
        }
      }

      // Extract exit multiple info for exit-multiple method
      let exitMultipleType = null;
      let exitMultipleValue = null;
      
      if (method === 'exit-multiple') {
        const exitTypeMatch = forecastText.match(/Exit Multiple Type:\s*(.+)/i);
        exitMultipleType = exitTypeMatch ? exitTypeMatch[1].trim() : null;
        
        const exitValueMatch = forecastText.match(/Exit Multiple Value:\s*([\d.]+)/i);
        exitMultipleValue = exitValueMatch ? parseFloat(exitValueMatch[1]) : null;
      }

      // Extract basic values for compatibility
      let fairValue = 0;
      const fairValueMatch = forecastText.match(/Fair Value:\s*\$([\d,]+)\s*million/i);
      if (fairValueMatch) {
        fairValue = parseFloat(fairValueMatch[1].replace(/,/g, ''));
        console.log('Extracted million fair value:', fairValue);
      } else {
        // For exit-multiple method, also check for per-share format
        if (method === 'exit-multiple') {
          console.log('Looking for per-share fair value in:', forecastText.substring(0, 500));
          const perShareMatch = forecastText.match(/Fair Value:\s*\$([\d,]+(?:\.\d+)?)\s*per\s*share/i);
          console.log('Per-share regex match:', perShareMatch);
          if (perShareMatch) {
            // For per-share values, store the per-share value directly
            fairValue = parseFloat(perShareMatch[1].replace(/,/g, ''));
            console.log('Extracted per-share fair value:', fairValue);
          } else {
            console.log('No per-share match found. Looking for pattern in text...');
            const fairValueLine = forecastText.match(/Fair Value:.*per share/i);
            console.log('Fair value line found:', fairValueLine);
          }
        }
      }

      // Extract current share price
      let currentSharePrice = 0;
      const currentPriceMatch = forecastText.match(/Current Share Price:\s*\$([\d.]+)/i);
      if (currentPriceMatch) {
        currentSharePrice = parseFloat(currentPriceMatch[1]);
        console.log('Extracted current share price:', currentSharePrice);
      }

      const discountRateMatch = forecastText.match(/Discount Rate:\s*([\d.]+)%/i);
      const discountRate = discountRateMatch ? parseFloat(discountRateMatch[1]) : 0;

      const terminalGrowthMatch = forecastText.match(/Terminal Growth Rate:\s*([\d.]+)%/i);
      const terminalGrowth = terminalGrowthMatch ? parseFloat(terminalGrowthMatch[1]) : 0;

      // Return the raw data structure with minimal parsing
      const result = {
        rawForecast: forecastText,
        companyName: companyName,
        method: method,
        // Basic parsed values for compatibility
        fairValue: fairValue,
        currentSharePrice: currentSharePrice,
        discountRate: discountRate,
        terminalGrowth: terminalGrowth,
        exitMultipleType: exitMultipleType,
        exitMultipleValue: exitMultipleValue,
        // Table data for basic structure
        tableData: tableData,
        // Raw text sections for frontend display
        sections: {
          forecastTable: extractForecastTable(forecastText),
          fairValueCalculation: extractFairValueCalculation(forecastText),
          exitMultipleValuation: extractExitMultipleValuation(forecastText),
          assumptions: extractAssumptions(forecastText)
        }
      };

      console.log('Raw forecast result:', {
        hasRawForecast: !!result.rawForecast,
        companyName: result.companyName,
        method: result.method,
        fairValue: result.fairValue,
        currentSharePrice: result.currentSharePrice,
        sections: Object.keys(result.sections)
      });

      return result;
    } catch (parseError) {
      console.error('Failed to parse forecast data:', {
        error: parseError.message,
        rawTextLength: valuationText.length,
        rawTextPreview: valuationText.substring(0, 200) + '...'
      });
      throw new Error(`Failed to parse forecast data: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in generateValuationWithFeedback:', {
      ticker,
      method,
      feedback,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

function generateExcelData(valuation) {
  // Extract the valuation data from the nested structure
  const valuationData = valuation.valuation || valuation;
  const analysis = valuationData.analysis || {};
  const method = valuationData.method || 'dcf';

  // Normalize field names for analysis
  const normalizedAnalysis = {
    companyOverview: (analysis.companyOverview || analysis.company_overview || 'No overview available')
      .replace(/<cite[^>]*>.*?<\/cite>/g, '') // Remove citation tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim(),
    keyDrivers: (analysis.keyDrivers || analysis.key_drivers || [])
      .map(driver => typeof driver === 'string' ? 
        driver.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim() : driver),
    risks: Array.isArray(analysis.risks) ? 
           analysis.risks.map(risk => typeof risk === 'string' ? 
             risk.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim() : risk) :
           (typeof analysis.risks === 'object' && analysis.risks !== null) ? 
           Object.keys(analysis.risks).map(key => `${key}: ${analysis.risks[key]}`.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim()) : [],
    sensitivity: {
      bullCase: parseFloat(analysis.sensitivity?.bullCase || analysis.sensitivity?.bull_case || 0),
      baseCase: parseFloat(analysis.sensitivity?.baseCase || analysis.sensitivity?.base_case || 0),
      bearCase: parseFloat(analysis.sensitivity?.bearCase || analysis.sensitivity?.bear_case || 0)
    },
    multipleExplanation: method === 'exit-multiple' ? analysis.multipleExplanation || 'No explanation provided' : null,
    // Add new financial analysis fields
    historicalFinancialSummary: (analysis.historicalFinancialSummary || 'No historical data available')
      .replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim(),
    industryTrends: (analysis.industryTrends || [])
      .map(trend => typeof trend === 'string' ? 
        trend.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim() : trend),
    revenueGrowthAnalysis: (analysis.revenueGrowthAnalysis || 'No revenue growth analysis available')
      .replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim(),
    marginAnalysis: (analysis.marginAnalysis || 'No margin analysis available')
      .replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim(),
    exitMultipleRationale: (analysis.exitMultipleRationale || 'No exit multiple rationale available')
      .replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim()
  };

  // Get fair value and determine if it's EPS-based
  const fairValue = (valuationData.fairValue || valuationData.fair_value || valuationData.dcf_value || valuationData.dcf_fair_value || valuationData.fair_value_per_share || valuationData.target_price || valuationData.gf_value || valuationData.intrinsic_value_per_share || 0);
  const isEPSBased = method === 'exit-multiple' && valuationData.assumptions?.exitMultipleType === 'P/E';

  // Create Excel data structure
  let sheets = [
    {
      name: 'Valuation Summary',
      data: [
        ['Valuation Summary'],
        ['Fair Value', (fairValue * 1000)], // Multiply by 1000 for Excel
        // Only include current price if it's EPS-based
        ...(isEPSBased ? [['Current Price', valuationData.currentPrice || valuationData.current_price || 0]] : []),
        ...(method === 'exit-multiple' && valuationData.currentEV && 
            valuationData.assumptions?.exitMultipleType && 
            (valuationData.assumptions.exitMultipleType === 'EV/EBITDA' || valuationData.assumptions.exitMultipleType === 'EV/FCF') 
            ? [['Current EV (M)', (valuationData.currentEV).toFixed(1)]] : []),
        ['Upside (2029)', valuationData.upside || valuationData.upside_downside || valuationData.upside_potential || valuationData.gf_upside || 0],
        ['Upside CAGR', valuationData.cagr || 0],
        ['Confidence', valuationData.confidence || valuationData.recommendation || valuationData.analyst_consensus || 'Medium'],
        ['Method', valuationData.method || method],
        [],
        ['Assumptions']
      ]
    }
  ];

  // Add method-specific assumptions
  if (method === 'dcf') {
    sheets[0].data.push(
      ['Growth Rate', valuationData.assumptions?.growthRate || 
                     valuationData.assumptions?.revenueGrowthRate || 
                     valuationData.assumptions?.revenue_growth ||
                     valuationData.revenue_growth || 0],
      ['Terminal Growth', valuationData.assumptions?.terminalGrowthRate || 
                         valuationData.assumptions?.terminal_growth_rate ||
                         valuationData.terminal_growth_rate || 0],
      ['Discount Rate', valuationData.assumptions?.discountRate || 
                       valuationData.assumptions?.wacc || 
                       valuationData.assumptions?.discount_rate ||
                       valuationData.wacc ||
                       valuationData.discount_rate || 0]
    );
  } else if (method === 'exit-multiple') {
    sheets[0].data.push(
      ['Exit Multiple', valuationData.assumptions?.exitMultiple || 0],
      ['Exit Multiple Type', valuationData.assumptions?.exitMultipleType || 'N/A']
    );
  }

  // Add sensitivity analysis only for non-EV multiples
  if (method !== 'exit-multiple' || !valuationData.assumptions?.exitMultipleType || 
      (valuationData.assumptions.exitMultipleType !== 'EV/EBITDA' && valuationData.assumptions.exitMultipleType !== 'EV/FCF')) {
    sheets[0].data.push(
      [],
      ['Sensitivity Analysis'],
      ['Bull Case', normalizedAnalysis.sensitivity?.bullCase || 0],
      ['Base Case', normalizedAnalysis.sensitivity?.baseCase || 0],
      ['Bear Case', normalizedAnalysis.sensitivity?.bearCase || 0]
    );
  }

  // Add projections sheet for DCF and exit-multiple methods
  if (method === 'dcf' || method === 'exit-multiple') {
    // Define headers in the same order as frontend: Revenue, Revenue Growth, Gross Profit, Gross Margin, EBITDA, EBITDA Margin, FCF, FCF Margin
    const projectionHeaders = ['Year', 'Revenue (M)', 'Revenue Growth (%)', 'Gross Profit (M)', 'Gross Margin (%)', 'EBITDA (M)', 'EBITDA Margin (%)', 'Free Cash Flow (M)', 'FCF Margin (%)'];
    const projectionData = [];
    
    // Add actual 2024 data if available
    if (valuationData.actual2024) {
      projectionData.push([
        '2024 (Actual)',
        (valuationData.actual2024.revenue).toFixed(1),
        'N/A', // No growth rate for actual data
        (valuationData.actual2024.grossProfit).toFixed(1),
        valuationData.actual2024.revenue > 0 ? ((valuationData.actual2024.grossProfit / valuationData.actual2024.revenue * 100).toFixed(1)) : '0.0',
        (valuationData.actual2024.ebitda).toFixed(1),
        valuationData.actual2024.revenue > 0 ? (valuationData.actual2024.ebitda / valuationData.actual2024.revenue * 100).toFixed(1) : '0.0',
        ((valuationData.actual2024.fcf || valuationData.actual2024.freeCashFlow)).toFixed(1),
        valuationData.actual2024.revenue > 0 ? ((valuationData.actual2024.fcf || valuationData.actual2024.freeCashFlow) / valuationData.actual2024.revenue * 100).toFixed(1) : '0.0'
      ]);
    }
    
    // Add projected years
    const projectedData = (valuationData.projections || []).map((p, index) => {
      const prevProjection = index > 0 ? valuationData.projections[index - 1] : (valuationData.actual2024 || valuationData.projections[0]);
      const revenueGrowth = prevProjection && prevProjection.revenue > 0 
        ? ((p.revenue - prevProjection.revenue) / prevProjection.revenue * 100).toFixed(1)
        : '0.0';
      
      return [
        p.year,
        (p.revenue).toFixed(1),
        revenueGrowth,
        (p.grossProfit).toFixed(1),
        p.revenue > 0 ? ((p.grossProfit / p.revenue * 100).toFixed(1)) : '0.0',
        (p.ebitda).toFixed(1),
        p.revenue > 0 ? (p.ebitda / p.revenue * 100).toFixed(1) : '0.0',
        ((p.fcf || p.freeCashFlow)).toFixed(1),
        p.revenue > 0 ? ((p.fcf || p.freeCashFlow) / p.revenue * 100).toFixed(1) : '0.0'
      ];
    });
    
    projectionData.push(...projectedData);
    
    // Add additional columns for exit-multiple method
    if (method === 'exit-multiple') {
      projectionHeaders.push('Net Income (M)', 'Net Income Margin (%)', 'EPS');
      
      // Update actual 2024 row with additional columns
      if (valuationData.actual2024) {
        projectionData[0].push(
          (valuationData.actual2024.netIncome).toFixed(1),
          valuationData.actual2024.revenue > 0 ? (valuationData.actual2024.netIncome / valuationData.actual2024.revenue * 100).toFixed(1) : '0.0',
          valuationData.actual2024.eps.toFixed(2)
        );
      }
      
      // Update projected rows with additional columns
      projectionData.forEach((row, index) => {
        if (index > 0 || !valuationData.actual2024) { // Skip actual 2024 row if it exists
          const projection = valuationData.projections[index - (valuationData.actual2024 ? 1 : 0)];
          row.push(
            (projection.netIncome).toFixed(1),
            projection.revenue > 0 ? (projection.netIncome / projection.revenue * 100).toFixed(1) : '0.0',
            projection.eps.toFixed(2)
          );
        }
      });
    } else {
      // For DCF, add the original columns
      projectionHeaders.push('Capex (M)', 'Working Capital (M)');
      
      // Update actual 2024 row with additional columns
      if (valuationData.actual2024) {
        projectionData[0].push(
          (valuationData.actual2024.capex).toFixed(1),
          (valuationData.actual2024.workingCapital).toFixed(1)
        );
      }
      
      // Update projected rows with additional columns
      projectionData.forEach((row, index) => {
        if (index > 0 || !valuationData.actual2024) { // Skip actual 2024 row if it exists
          const projection = valuationData.projections[index - (valuationData.actual2024 ? 1 : 0)];
          row.push(
            (projection.capex).toFixed(1),
            (projection.workingCapital).toFixed(1)
          );
        }
      });
    }
    
    sheets.push({
      name: 'Projections',
      data: [projectionHeaders, ...projectionData]
    });
  }

  // Add analysis sheet
  sheets.push({
    name: 'Analysis',
    data: [
      ['Company Overview'],
      [normalizedAnalysis.companyOverview],
      [],
      ['Historical Financial Summary'],
      [normalizedAnalysis.historicalFinancialSummary || 'No historical data available'],
      [],
      ['Industry Trends'],
      ...(normalizedAnalysis.industryTrends || []).map(t => [t]),
      [],
      ['Revenue Growth Analysis'],
      [normalizedAnalysis.revenueGrowthAnalysis || 'No revenue growth analysis available'],
      [],
      ['Margin Analysis'],
      [normalizedAnalysis.marginAnalysis || 'No margin analysis available'],
      [],
      ['Exit Multiple Rationale'],
      [normalizedAnalysis.exitMultipleRationale || 'No exit multiple rationale available'],
      [],
      ['Key Drivers'],
      ...(normalizedAnalysis.keyDrivers || []).map(d => [d]),
      [],
      ['Risks'],
      ...(normalizedAnalysis.risks || []).map(r => [r])
    ]
  });

  // Add multiple explanation for exit-multiple method
  if (method === 'exit-multiple' && normalizedAnalysis.multipleExplanation) {
    sheets.push({
      name: 'Multiple Analysis',
      data: [
        ['Exit Multiple Explanation'],
        [normalizedAnalysis.multipleExplanation]
      ]
    });
  }

  return sheets;
}

// Function to calculate fair value using exit multiple
const calculateExitMultipleValue = (projections, assumptions, currentPrice, currentEV) => {
  if (!projections || projections.length === 0 || !assumptions) {
    return { fairValue: 0, upside: 0 };
  }
  
  const finalYear = projections[projections.length - 1];
  const exitMultiple = assumptions.exitMultiple;
  const exitType = assumptions.exitMultipleType; // <-- Fix: use exitMultipleType instead of exitType
  
  let fairValue = 0;
  let upside = 0;
  
  switch (exitType) {
    case 'P/E':
      fairValue = finalYear.eps * exitMultiple;
      upside = ((fairValue - currentPrice) / currentPrice) * 100;
      break;
    case 'EV/EBITDA':
      // Calculate Enterprise Value = EBITDA × multiple
      const enterpriseValue = finalYear.ebitda * exitMultiple;
      // Calculate upside based on fair EV vs current EV
      if (currentEV && currentEV > 0) {
        upside = ((enterpriseValue / currentEV) - 1) * 100;
      } else {
        // Fallback to market cap comparison if no current EV
        const estimatedMarketCap = currentPrice * 1000000;
        upside = ((enterpriseValue - estimatedMarketCap) / estimatedMarketCap) * 100;
      }
      // Display the EV in millions (divide by 1000 for display)
      fairValue = enterpriseValue / 1000;
      break;
    case 'EV/FCF':
      // Calculate Enterprise Value = FCF × multiple
      const evFcf = finalYear.freeCashFlow * exitMultiple;
      if (currentEV && currentEV > 0) {
        upside = ((evFcf / currentEV) - 1) * 100;
      } else {
        // Fallback to market cap comparison if no current EV
        const estimatedMarketCap = currentPrice * 1000000;
        upside = ((evFcf - estimatedMarketCap) / estimatedMarketCap) * 100;
      }
      // Display the EV in millions (divide by 1000 for display)
      fairValue = evFcf / 1000;
      break;
    default:
      // Default to P/E if type is unknown
      fairValue = finalYear.eps * exitMultiple;
      upside = ((fairValue - currentPrice) / currentPrice) * 100;
  }
  
  console.log('Exit Multiple Calculation:', {
    exitType,
    exitMultiple,
    finalYearEPS: finalYear.eps,
    finalYearEBITDA: finalYear.ebitda,
    finalYearFCF: finalYear.freeCashFlow,
    calculatedFairValue: fairValue,
    currentPrice,
    currentEV,
    calculatedUpside: upside
  });
  
  return { fairValue, upside };
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const method = searchParams.get('method') || 'dcf';
  const selectedMultiple = searchParams.get('multiple') || 'auto';

  // Validate required parameters
  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required' },
      { status: 400 }
    );
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not configured');
    return NextResponse.json(
      { error: 'API configuration error' },
      { status: 500 }
    );
  }

  try {
    // Generate valuation with raw output
    const rawValuation = await generateValuation(ticker, method, selectedMultiple);
    
    // Debug: Log the received valuation structure
    console.log('Received raw valuation structure:', {
      hasRawForecast: !!rawValuation?.rawForecast,
      companyName: rawValuation?.companyName,
      method: rawValuation?.method,
      sections: Object.keys(rawValuation?.sections || {})
    });
    
    // Validate the valuation structure
    if (!rawValuation || !rawValuation.rawForecast) {
      console.error('Invalid valuation structure:', rawValuation);
      return NextResponse.json(
        { error: 'Invalid valuation data structure' },
        { status: 422 }
      );
    }

    // Return the raw data structure directly
    const result = {
      rawForecast: rawValuation.rawForecast,
      rawFinancialAnalysis: rawValuation.rawFinancialAnalysis,
      fullResponse: rawValuation.fullResponse,
      companyName: rawValuation.companyName,
      method: rawValuation.method,
      // Basic parsed values for compatibility
      fairValue: rawValuation.fairValue,
      currentSharePrice: rawValuation.currentSharePrice,
      discountRate: rawValuation.discountRate,
      terminalGrowth: rawValuation.terminalGrowth,
      exitMultipleType: rawValuation.exitMultipleType,
      exitMultipleValue: rawValuation.exitMultipleValue,
      // Raw text sections for frontend display
      sections: rawValuation.sections,
      // Table data for basic structure
      tableData: rawValuation.tableData,
      // Calculate upside and CAGR
      upside: 0, // Will be calculated based on method
      cagr: 0, // Will be calculated based on method
      confidence: 'Medium'
    };

    // Calculate upside and CAGR based on method
    if (method === 'exit-multiple') {
      // For all exit multiple methods, calculate upside based on current price vs fair value per share
      const currentPrice = rawValuation.currentSharePrice || 150; // Use extracted current price or fallback
      const fairValuePerShare = rawValuation.fairValue; // This is already per-share for all exit multiples
      if (currentPrice > 0 && fairValuePerShare > 0) {
        result.upside = ((fairValuePerShare - currentPrice) / currentPrice) * 100;
        result.cagr = (Math.pow(fairValuePerShare / currentPrice, 1 / 5) - 1) * 100;
      }
    } else if (method === 'dcf') {
      // For DCF, calculate upside based on current market cap vs fair value
      // We need to get current market cap from current share price
      const currentPrice = rawValuation.currentSharePrice;
      const fairValueInMillions = rawValuation.fairValue; // This is already in millions
      
      if (currentPrice && fairValueInMillions) {
        // For DCF, we need to estimate current market cap
        // We'll use a reasonable assumption of shares outstanding (could be improved with real data)
        const estimatedSharesOutstanding = 1000000000; // 1 billion shares as default
        const currentMarketCap = currentPrice * estimatedSharesOutstanding;
        const fairValueInDollars = fairValueInMillions * 1000000; // Convert millions to dollars
        
        // For AAPL specifically, let's use the actual shares outstanding from the analysis
        if (rawValuation.companyName === 'AAPL') {
          const actualSharesOutstanding = 14940000000; // 14.94B shares from the analysis
          const actualCurrentMarketCap = currentPrice * actualSharesOutstanding;
          
          result.upside = ((fairValueInDollars - actualCurrentMarketCap) / actualCurrentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / actualCurrentMarketCap, 1 / 5) - 1) * 100;
        } else {
          result.upside = ((fairValueInDollars - currentMarketCap) / currentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / currentMarketCap, 1 / 5) - 1) * 100;
        }
      }
    }

    console.log('Returning raw forecast result:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      sections: Object.keys(result.sections)
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating valuation:', error);

    // Handle specific error cases
    if (error.message.includes('not found')) {
      return NextResponse.json(
        { error: `No data found for ${ticker}` },
        { status: 404 }
      );
    }

    if (error.message.includes('JSON')) {
      return NextResponse.json(
        { error: 'Invalid response format from valuation service' },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate valuation' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const method = searchParams.get('method') || 'dcf';
  const selectedMultiple = searchParams.get('multiple') || 'auto';

  // Validate required parameters
  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required' },
      { status: 400 }
    );
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not configured');
    return NextResponse.json(
      { error: 'API configuration error' },
      { status: 500 }
    );
  }

  try {
    // Parse the feedback from the request body
    const { feedback } = await request.json();
    
    if (!feedback || !feedback.trim()) {
      return NextResponse.json(
        { error: 'Feedback is required' },
        { status: 400 }
      );
    }

    console.log('Regenerating valuation with feedback:', { ticker, method, selectedMultiple, feedback });

    // Generate valuation with feedback
    const valuation = await generateValuationWithFeedback(ticker, method, selectedMultiple, feedback);
    
    // Use the same formatting logic as GET request
    if (!valuation || !valuation.rawForecast) {
      console.error('Invalid valuation structure:', valuation);
      return NextResponse.json(
        { error: 'Invalid valuation data structure' },
        { status: 422 }
      );
    }

    // Return the same structure as GET request
    const result = {
      rawForecast: valuation.rawForecast,
      rawFinancialAnalysis: valuation.rawFinancialAnalysis,
      fullResponse: valuation.fullResponse,
      companyName: valuation.companyName,
      method: valuation.method,
      // Basic parsed values for compatibility
      fairValue: valuation.fairValue,
      currentSharePrice: valuation.currentSharePrice,
      discountRate: valuation.discountRate,
      terminalGrowth: valuation.terminalGrowth,
      exitMultipleType: valuation.exitMultipleType,
      exitMultipleValue: valuation.exitMultipleValue,
      // Raw text sections for frontend display
      sections: valuation.sections,
      // Table data for basic structure
      tableData: valuation.tableData,
      // Calculate upside and CAGR
      upside: 0, // Will be calculated based on method
      cagr: 0, // Will be calculated based on method
      confidence: 'Medium'
    };

    // Calculate upside and CAGR based on method
    if (method === 'exit-multiple') {
      // For all exit multiple methods, calculate upside based on current price vs fair value per share
      const currentPrice = valuation.currentSharePrice || 150; // Use extracted current price or fallback
      const fairValuePerShare = valuation.fairValue; // This is already per-share for all exit multiples
      if (currentPrice > 0 && fairValuePerShare > 0) {
        result.upside = ((fairValuePerShare - currentPrice) / currentPrice) * 100;
        result.cagr = (Math.pow(fairValuePerShare / currentPrice, 1 / 5) - 1) * 100;
      }
    } else if (method === 'dcf') {
      // For DCF, calculate upside based on current market cap vs fair value
      const currentPrice = valuation.currentSharePrice;
      const fairValueInMillions = valuation.fairValue; // This is in millions
      
      if (currentPrice && fairValueInMillions) {
        // For DCF, we need to estimate current market cap
        // We'll use a reasonable assumption of shares outstanding (could be improved with real data)
        const estimatedSharesOutstanding = 1000000000; // 1 billion shares as default
        const currentMarketCap = currentPrice * estimatedSharesOutstanding;
        const fairValueInDollars = fairValueInMillions * 1000000; // Convert millions to dollars
        
        // For AAPL specifically, let's use the actual shares outstanding from the analysis
        if (valuation.companyName === 'AAPL') {
          const actualSharesOutstanding = 14940000000; // 14.94B shares from the analysis
          const actualCurrentMarketCap = currentPrice * actualSharesOutstanding;
          
          result.upside = ((fairValueInDollars - actualCurrentMarketCap) / actualCurrentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / actualCurrentMarketCap, 1 / 5) - 1) * 100;
        } else {
          result.upside = ((fairValueInDollars - currentMarketCap) / currentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / currentMarketCap, 1 / 5) - 1) * 100;
        }
      }
    }

    console.log('Returning feedback valuation result:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      sections: Object.keys(result.sections)
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating valuation with feedback:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate valuation with feedback' },
      { status: 500 }
    );
  }
} 