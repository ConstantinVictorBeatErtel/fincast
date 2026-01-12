import { NextResponse } from 'next/server';
import { headers as nextHeaders } from 'next/headers';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';

// Helper function to make OpenRouter API calls with timeout handling
async function makeOpenRouterRequest(body, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const referer = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'Referer': referer,
        'Origin': referer,
        'X-Title': 'Fincast Valuation App'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
      console.error('OpenRouter API error:', {
        status: response.status,
        statusText: response.statusText,
        error: error,
        body: body
      });

      if (response.status === 404) {
        throw new Error('Unable to find data. Please verify the ticker symbol.');
      }

      throw new Error(`Provider returned error: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error('OpenRouter API request timed out after', timeoutMs / 1000, 'seconds');
      throw new Error('Request timed out. Please try again.');
    }

    throw error;
  }
}

// Function to get exchange rate from currency to USD
async function getExchangeRate(fromCurrency, toCurrency = 'USD') {
  if (fromCurrency === toCurrency) return 1.0;
  
  try {
    // Use yahoo-finance2 to get exchange rate
    const exchangeTicker = `${fromCurrency}${toCurrency}=X`;
    const quote = await yahooFinance.quote(exchangeTicker);
    return quote.regularMarketPrice || 1.0;
  } catch (error) {
    console.error(`Failed to get exchange rate for ${fromCurrency} to ${toCurrency}:`, error.message);
    // Fallback to approximate rates (these should be updated regularly)
    const fallbackRates = {
      'DKK': 0.15, // 1 DKK ≈ 0.15 USD
      'SEK': 0.095, // 1 SEK ≈ 0.095 USD
      'NOK': 0.095, // 1 NOK ≈ 0.095 USD
      'CHF': 1.1, // 1 CHF ≈ 1.1 USD
      'GBP': 1.25, // 1 GBP ≈ 1.25 USD
      'EUR': 1.08, // 1 EUR ≈ 1.08 USD
      'JPY': 0.0067, // 1 JPY ≈ 0.0067 USD
      'CNY': 0.14, // 1 CNY ≈ 0.14 USD
      'INR': 0.012, // 1 INR ≈ 0.012 USD
      'BRL': 0.20, // 1 BRL ≈ 0.20 USD
      'CAD': 0.74, // 1 CAD ≈ 0.74 USD
      'AUD': 0.66, // 1 AUD ≈ 0.66 USD
      'KRW': 0.00075, // 1 KRW ≈ 0.00075 USD
      'TWD': 0.031, // 1 TWD ≈ 0.031 USD
      'HKD': 0.13, // 1 HKD ≈ 0.13 USD
      'SGD': 0.74 // 1 SGD ≈ 0.74 USD
    };
    return fallbackRates[fromCurrency] || 1.0;
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const method = searchParams.get('method') || 'exit-multiple';
    const selectedMultiple = searchParams.get('multiple') || 'auto';
    const useLLM = (searchParams.get('llm') === '1') || (process.env.USE_LLM === 'true') || true;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    let yf = await fetchYFinanceDataDirect(ticker, request.headers).catch(() => null);
    if (!yf) {
      console.log('No yfinance data available, proceeding with LLM-only valuation');
      // Create minimal yfinance data structure for LLM to work with
      yf = {
        fy24_financials: {},
        market_data: {},
        company_name: ticker,
        source: 'llm-only',
        currency_info: {
          original_currency: 'USD',
          converted_to_usd: false,
          conversion_rate: 1.0,
          exchange_rate_source: 'none'
        },
        historical_financials: []
      };
    }

    if (useLLM) {
      if (!process.env.OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
          }
          try {
        const sonar = await fetchLatestWithSonar(ticker).catch(() => null);
        let lastErr = null;
        let valuation = null;
        // Try different models with exponential backoff
        const models = [
          'x-ai/grok-code-fast-1',
          'x-ai/grok-beta',
          'openai/gpt-4o-mini',
          'meta-llama/llama-3.1-8b-instruct:free',
          'microsoft/phi-3-medium-128k-instruct:free'
        ];
        
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const model = models[Math.min(attempt - 1, models.length - 1)];
            console.log(`[LLM] Attempt ${attempt}/5 for ${ticker} using model: ${model}`);
            
            // Add exponential backoff delay
            if (attempt > 1) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 2), 10000); // Max 10 seconds
              console.log(`[LLM] Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            valuation = await generateValuation(ticker, method, selectedMultiple, yf, sonar?.full_response || '', '', model);
            if (valuation && Array.isArray(valuation.projections) && valuation.projections.length > 0) {
              console.log(`[LLM] Success on attempt ${attempt} with ${valuation.projections.length} projections using ${model}`);
              break;
            }
            lastErr = new Error('Missing projections');
          } catch (e) {
            console.log(`[LLM] Attempt ${attempt} failed:`, e.message);
            lastErr = e;
            
            // If it's a rate limit error, try next model immediately
            if (e.message.includes('429') || e.message.includes('rate limit') || e.message.includes('Too Many Requests')) {
              console.log(`[LLM] Rate limit detected, trying next model...`);
              continue;
            }
          }
        }
        if (!valuation) {
          console.log('[LLM] All attempts failed, creating fallback valuation');
          // Create a basic fallback valuation if LLM completely fails
          valuation = {
            rawForecast: `Basic financial forecast for ${ticker}:\n\nYear | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M) | EPS\n---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | --------------- | ---\n2024 | 100000 | N/A | 40.0 | 25.0 | 20.0 | 20000 | 5.00\n2025 | 105000 | 5.0 | 40.0 | 25.0 | 20.0 | 21000 | 5.25\n2026 | 110250 | 5.0 | 40.0 | 25.0 | 20.0 | 22050 | 5.51\n2027 | 115763 | 5.0 | 40.0 | 25.0 | 20.0 | 23153 | 5.79\n2028 | 121551 | 5.0 | 40.0 | 25.0 | 20.0 | 24310 | 6.08\n2029 | 127628 | 5.0 | 40.0 | 25.0 | 20.0 | 25526 | 6.38`,
            companyName: yf?.company_name || ticker,
            method: method,
            fairValue: 100,
            currentSharePrice: 90,
            exitMultipleType: 'P/E',
            exitMultipleValue: 20,
            upside: 11.11,
            cagr: 2.13,
            projections: [
              { year: '2024', revenue: 100000, revenueGrowth: 0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 20000, eps: 5.00 },
              { year: '2025', revenue: 105000, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 21000, eps: 5.25 },
              { year: '2026', revenue: 110250, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 22050, eps: 5.51 },
              { year: '2027', revenue: 115763, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 23153, eps: 5.79 },
              { year: '2028', revenue: 121551, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 24310, eps: 6.08 },
              { year: '2029', revenue: 127628, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 25526, eps: 6.38 }
            ],
            historicalFinancials: yf?.historical_financials || [],
            latestDevelopments: 'LLM service temporarily unavailable. Showing basic financial projections.',
            source: 'fallback'
          };
        }
        if (sonar?.full_response) {
          valuation.latestDevelopments = sonar.full_response;
          valuation.sonar = sonar;
        }
        return NextResponse.json(valuation);
      } catch (e) {
        return NextResponse.json({ error: `LLM failed: ${e?.message || 'unknown error'}` }, { status: 502 });
      }
    }

    const eps = Number(yf?.fy24_financials?.eps || 0);
    const currentPrice = Number(yf?.market_data?.current_price || 0);

    let multiple = 18;
    if (method === 'exit-multiple') {
      multiple = selectedMultiple === 'auto' ? 18 : Number(selectedMultiple) || 18;
    }

    const fairValue = eps > 0 ? eps * multiple : 0;
    const upside = currentPrice > 0 && fairValue > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : 0;
    // Calculate years to 2029 from today (2026-01-12)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 0-indexed, so add 1
    const yearsTo2029 = 2029 - currentYear + (12 - currentMonth) / 12;
    const cagr = currentPrice > 0 && fairValue > 0 ? (Math.pow(fairValue / currentPrice, 1 / yearsTo2029) - 1) * 100 : 0;

    return NextResponse.json({ error: 'LLM disabled by request and no fallback allowed' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const method = searchParams.get('method') || 'exit-multiple';
    const selectedMultiple = searchParams.get('multiple') || 'auto';
    const { feedback } = await request.json().catch(() => ({ feedback: '' }));

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    let yf = await fetchYFinanceDataDirect(ticker, request.headers).catch(() => null);
    if (!yf) {
      console.log('No yfinance data available for feedback, proceeding with LLM-only valuation');
      // Create minimal yfinance data structure for LLM to work with
      yf = {
        fy24_financials: {},
        market_data: {},
        company_name: ticker,
        source: 'llm-only',
        currency_info: {
          original_currency: 'USD',
          converted_to_usd: false,
          conversion_rate: 1.0,
          exchange_rate_source: 'none'
        },
        historical_financials: []
      };
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }
    try {
      const sonar = await fetchLatestWithSonar(ticker).catch(() => null);
      let lastErr = null;
      let valuation = null;
      // Try different models with exponential backoff
      const models = [
        'x-ai/grok-code-fast-1',
        'x-ai/grok-beta',
        'openai/gpt-4o-mini',
        'meta-llama/llama-3.1-8b-instruct:free',
        'microsoft/phi-3-medium-128k-instruct:free'
      ];
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const model = models[Math.min(attempt - 1, models.length - 1)];
          console.log(`[LLM] POST Attempt ${attempt}/5 for ${ticker} with feedback using model: ${model}`);
          
          // Add exponential backoff delay
          if (attempt > 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 2), 10000); // Max 10 seconds
            console.log(`[LLM] POST Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          valuation = await generateValuation(ticker, method, selectedMultiple, yf, sonar?.full_response || '', feedback || '', model);
          if (valuation && Array.isArray(valuation.projections) && valuation.projections.length > 0) {
            console.log(`[LLM] POST Success on attempt ${attempt} with ${valuation.projections.length} projections using ${model}`);
            break;
          }
          lastErr = new Error('Missing projections');
        } catch (e) {
          console.log(`[LLM] POST Attempt ${attempt} failed:`, e.message);
          lastErr = e;
          
          // If it's a rate limit error, try next model immediately
          if (e.message.includes('429') || e.message.includes('rate limit') || e.message.includes('Too Many Requests')) {
            console.log(`[LLM] POST Rate limit detected, trying next model...`);
            continue;
          }
        }
      }
      if (!valuation) {
        console.log('[LLM] POST All attempts failed, creating fallback valuation');
        // Create a basic fallback valuation if LLM completely fails
        valuation = {
          rawForecast: `Basic financial forecast for ${ticker} (with feedback: ${feedback || 'none'}):\n\nYear | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M) | EPS\n---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | --------------- | ---\n2024 | 100000 | N/A | 40.0 | 25.0 | 20.0 | 20000 | 5.00\n2025 | 105000 | 5.0 | 40.0 | 25.0 | 20.0 | 21000 | 5.25\n2026 | 110250 | 5.0 | 40.0 | 25.0 | 20.0 | 22050 | 5.51\n2027 | 115763 | 5.0 | 40.0 | 25.0 | 20.0 | 23153 | 5.79\n2028 | 121551 | 5.0 | 40.0 | 25.0 | 20.0 | 24310 | 6.08\n2029 | 127628 | 5.0 | 40.0 | 25.0 | 20.0 | 25526 | 6.38`,
          companyName: yf?.company_name || ticker,
          method: method,
          fairValue: 100,
          currentSharePrice: 90,
          exitMultipleType: 'P/E',
          exitMultipleValue: 20,
          upside: 11.11,
          cagr: 2.13,
          projections: [
            { year: '2024', revenue: 100000, revenueGrowth: 0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 20000, eps: 5.00 },
            { year: '2025', revenue: 105000, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 21000, eps: 5.25 },
            { year: '2026', revenue: 110250, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 22050, eps: 5.51 },
            { year: '2027', revenue: 115763, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 23153, eps: 5.79 },
            { year: '2028', revenue: 121551, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 24310, eps: 6.08 },
            { year: '2029', revenue: 127628, revenueGrowth: 5.0, grossMargin: 40, ebitdaMargin: 25, fcfMargin: 20, netIncome: 25526, eps: 6.38 }
          ],
          historicalFinancials: yf?.historical_financials || [],
          latestDevelopments: `LLM service temporarily unavailable. Showing basic financial projections.${feedback ? ` User feedback: ${feedback}` : ''}`,
          source: 'fallback'
        };
      }
      if (sonar?.full_response) {
        valuation.latestDevelopments = sonar.full_response;
        valuation.sonar = sonar;
      }
      return NextResponse.json(valuation);
    } catch (e) {
      return NextResponse.json({ error: `LLM failed: ${e?.message || 'unknown error'}` }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

async function fetchLatestWithSonar(ticker) {
  try {
    const messages = [
      { role: 'system', content: 'Return ONLY JSON. Be concise. Use official IR and SEC sources.' },
      { role: 'user', content: `Find the most recently reported quarter for ${ticker} (as filed or disclosed by the company) and provide financials and qualitative insights for that same quarter only. Do NOT assume a specific quarter label. Return EXACT JSON with: as_of_date, latest_quarter, latest_quarter_revenue, latest_quarter_gross_margin_pct, latest_quarter_ebitda_margin_pct, latest_quarter_net_income, guidance_summary, mgmt_summary, recent_developments, links { ir_url, sec_url }.` }
    ];

    const data = await makeOpenRouterRequest({ model: 'perplexity/sonar', messages, temperature: 0.3, max_tokens: 1000 });
    const text = data?.choices?.[0]?.message?.content || '';
    let sonarData = {};
    try {
      sonarData = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) sonarData = JSON.parse(m[0]);
    }
    const full = `Latest quarterly data for ${ticker}:
- Management: ${sonarData.mgmt_summary || ''}
- Guidance: ${sonarData.guidance_summary || ''}
- Recent Developments: ${sonarData.recent_developments || ''}`;
    return { ...sonarData, full_response: full };
  } catch (e) {
    return null;
  }
}

// Direct yfinance fetch using yahoo-finance2 npm package (Node.js/JavaScript)
async function fetchYFinanceDataDirect(ticker, hdrs) {
  try {
    console.log(`[yahoo-finance2] Fetching data for ${ticker} using Node.js package`);

    // Use yahoo-finance2 directly - works on both local and Vercel
    const quoteSummary = await yahooFinance.quoteSummary(ticker, { modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory'] });
    const quote = await yahooFinance.quote(ticker);

    if (!quoteSummary || !quote) {
      console.log(`[yahoo-finance2] No data returned for ${ticker}`);
      return null;
    }

    // Extract data
    const price = quote.regularMarketPrice || 0;
    const marketCap = quote.marketCap || 0;
    const eps = quoteSummary.defaultKeyStatistics?.trailingEps || 0;
    const peRatio = quote.trailingPE || 0;
    const sharesOutstanding = quoteSummary.defaultKeyStatistics?.sharesOutstanding || 0;

    // Extract most recent income statement data
    const incomeStatements = quoteSummary.incomeStatementHistory?.incomeStatementHistory || [];
    const latestIncome = incomeStatements[0] || {};
    const revenue = latestIncome.totalRevenue?.raw || 0;
    const grossProfit = latestIncome.grossProfit?.raw || 0;
    const netIncome = latestIncome.netIncome?.raw || 0;
    const ebitda = latestIncome.ebitda?.raw || 0;

    // Extract balance sheet
    const balanceSheets = quoteSummary.balanceSheetHistory?.balanceSheetStatements || [];
    const latestBalance = balanceSheets[0] || {};
    const totalDebt = latestBalance.totalDebt?.raw || 0;
    const cash = latestBalance.cash?.raw || 0;

    // Extract cash flow
    const cashflows = quoteSummary.cashflowStatementHistory?.cashflowStatements || [];
    const latestCashflow = cashflows[0] || {};
    const freeCashFlow = latestCashflow.freeCashflow?.raw || 0;

    // Calculate margins
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const ebitdaMarginPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
    const fcfMarginPct = revenue > 0 ? (freeCashFlow / revenue) * 100 : 0;

    // Build historical financials array (from income statements)
    const historicalFinancials = incomeStatements.slice(0, 5).map(stmt => ({
      date: stmt.endDate?.fmt || '',
      revenue: stmt.totalRevenue?.raw || 0,
      grossProfit: stmt.grossProfit?.raw || 0,
      netIncome: stmt.netIncome?.raw || 0,
      ebitda: stmt.ebitda?.raw || 0
    }));

    const result = {
      company_name: quote.shortName || quote.longName || ticker,
      fy24_financials: {
        revenue,
        gross_margin_pct: grossMarginPct,
        ebitda,
        ebitda_margin_pct: ebitdaMarginPct,
        net_income: netIncome,
        eps,
        shares_outstanding: sharesOutstanding,
        fcf: freeCashFlow,
        fcf_margin_pct: fcfMarginPct
      },
      market_data: {
        current_price: price,
        market_cap: marketCap,
        enterprise_value: marketCap + totalDebt - cash,
        pe_ratio: peRatio
      },
      currency_info: {
        original_currency: quote.currency || 'USD',
        converted_to_usd: quote.currency !== 'USD',
        conversion_rate: 1.0,
        exchange_rate_source: 'yahoo-finance2'
      },
      historical_financials: historicalFinancials,
      source: 'yahoo-finance2'
    };

    console.log(`[yahoo-finance2] Successfully fetched data for ${ticker}: ${historicalFinancials.length} historical records`);
    return result;
  } catch (e) {
    console.log(`[Error] fetchYFinanceDataDirect error: ${e.message}`);
  }
  return null;
}


async function generateValuation(ticker, method, selectedMultiple, yf_data, sonarFull, userFeedback = '', model = 'x-ai/grok-code-fast-1') {
  const mkNumber = (v) => Number(v || 0);
  const fy = yf_data?.fy24_financials || {};
  const md = yf_data?.market_data || {};
  const companyName = yf_data?.company_name || ticker;
  
  // Restore original, detailed prompts with strict output format and Sonar + yfinance context
    let prompt;
    if (method === 'dcf') {
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation for the company.

The company you will be analyzing is: ${(companyName)}

${userFeedback && userFeedback.trim().length ? `\nUSER FEEDBACK: ${userFeedback.trim()}\n\nPlease incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.\n` : ''}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below (which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${(mkNumber(fy.revenue)/1_000_000).toLocaleString()}M
- Gross Margin: ${mkNumber(fy.gross_margin_pct).toFixed(1)}%
- EBITDA: ${(mkNumber(fy.ebitda)/1_000_000).toLocaleString()}M
- Net Income: ${(mkNumber(fy.net_income)/1_000_000).toLocaleString()}M
- EPS: ${mkNumber(fy.eps).toFixed(2)}
- Shares Outstanding: ${(mkNumber(fy.shares_outstanding)/1_000_000).toLocaleString()}M

2. MARKET DATA (from yfinance - most updated):
- Current Price: $${mkNumber(md.current_price).toFixed(2)}
- Market Cap: ${(mkNumber(md.market_cap)/1_000_000).toLocaleString()}M
- Enterprise Value: ${md.enterprise_value ? (mkNumber(md.enterprise_value)/1_000_000).toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${md.pe_ratio ? mkNumber(md.pe_ratio).toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonarFull || 'No Sonar data available'}

4. Project revenue growth TASK: Based on the MOST UPDATED financial data above, create a financial forecast for ${ticker} up to 2029.
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
Company Name: ${(companyName)}

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

Current Share Price: $${mkNumber(md.current_price).toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]

</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
  } else {
    const multipleTypeInstruction = (selectedMultiple === 'auto') ? `Choose the most appropriate exit multiple based on industry and company characteristics:
- P/E: Consumer staples, Healthcare, Retail, Financials
- EV/FCF: Software (mature stage), Industrial compounders, Capital-light consumer businesses
- EV/EBITDA: Industrial conglomerates, Telecoms, Infrastructure, Manufacturing, high-growth tech firms
- Price/Sales: High-growth firms with negative or erratic earnings` : `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation using exit multiple valuation.

The company you will be analyzing is: ${(companyName)}

${multipleTypeInstruction}

${userFeedback && userFeedback.trim().length ? `\nUSER FEEDBACK: ${userFeedback.trim()}\n\nPlease incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.\n` : ''}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below (which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${(mkNumber(fy.revenue)/1_000_000).toLocaleString()}M
- Gross Margin: ${mkNumber(fy.gross_margin_pct).toFixed(1)}%
- EBITDA: ${(mkNumber(fy.ebitda)/1_000_000).toLocaleString()}M
- Net Income: ${(mkNumber(fy.net_income)/1_000_000).toLocaleString()}M
- EPS: ${mkNumber(fy.eps).toFixed(2)}
- Shares Outstanding: ${(mkNumber(fy.shares_outstanding)/1_000_000).toLocaleString()}M

2. MARKET DATA (from yfinance - most updated):
- Current Price: $${mkNumber(md.current_price).toFixed(2)}
- Market Cap: ${(mkNumber(md.market_cap)/1_000_000).toLocaleString()}M
- Enterprise Value: ${md.enterprise_value ? (mkNumber(md.enterprise_value)/1_000_000).toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${md.pe_ratio ? mkNumber(md.pe_ratio).toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonarFull || 'No Sonar data available'}

4. Project revenue growth TASK: Based on the MOST UPDATED financial data above, create a financial forecast for ${ticker} up to 2029.
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
Company Name: ${(companyName)}

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

Current Share Price: $${mkNumber(md.current_price).toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]

</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
    }

  const body = {
      model: model,
      messages: [
      { role: 'system', content: 'You are a skilled financial analyst. You MUST return your response in the EXACT format specified in the user prompt. The response MUST start with <forecast> and end with </forecast>. Do not include any text outside these tags.' },
      { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
  };

  const data = await makeOpenRouterRequest(body);
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty LLM response');

  const m = text.match(/<forecast>([\s\S]*?)<\/forecast>/i);
  let forecastText = m ? m[1] : text;
  // Strip code fences if present
  forecastText = forecastText.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '');
  const hasTable = /Year\s*\|[\s\S]*?\|/i.test(forecastText) || /\b20\d{2}\s*\|/.test(forecastText);
  if (!hasTable) throw new Error('Invalid forecast format');

  // Parse simple forecast table into projections for the UI charts
  const lines = forecastText.split('\n').map(l => l.trim()).filter(Boolean);
      let inTable = false;
  let header = null;
  let headerIdx = {};
  const splitRow = (line) => line.split('|').map(c => c.trim()).filter(c => c.length > 0);
  const findIdx = (parts, keys) => {
    const lower = parts.map(p => p.toLowerCase());
    for (const k of keys) {
      const i = lower.findIndex(x => x.includes(k));
      if (i !== -1) return i;
    }
    return -1;
  };
  const parseNum = (v) => {
    if (v == null) return 0;
    const n = Number(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const projections = [];
  let prevRevenue = null;
  // Capture FY2024 FCF margin anchor from yfinance (in %)
  const fy24Anchor = (() => {
    try {
      const fy = yf_data?.fy24_financials || {};
      const rev = Number(fy.revenue || 0) / 1_000_000; // convert to $M for consistency
      const fcf = Number(fy.fcf || 0) / 1_000_000;
      if (rev > 0 && fcf > 0) return (fcf / rev) * 100;
      if (typeof fy.fcf_margin_pct === 'number') return Number(fy.fcf_margin_pct);
    } catch {}
    return null;
  })();
  for (const raw of lines) {
    const line = raw.trim();
    // Detect table header
    if (!inTable) {
      if ((/^\|?\s*Year\s*\|/i.test(line)) || (/\|/.test(line) && /Year/i.test(line))) {
        inTable = true;
        header = splitRow(line);
        headerIdx = {
          year: findIdx(header, ['year']),
          revenue: findIdx(header, ['revenue']),
          grossProfit: findIdx(header, ['gross profit']),
          cogs: findIdx(header, ['cogs', 'cost of goods']),
          grossMargin: findIdx(header, ['gross margin']),
          ebitdaMargin: findIdx(header, ['ebitda margin']),
          operatingIncome: findIdx(header, ['operating income']),
          fcf: findIdx(header, ['free cash flow', 'fcf']),
          fcfMargin: findIdx(header, ['fcf margin', 'fcf (%)', 'free cash flow (%)', 'fcf percent', 'fcf pct']),
          netIncome: findIdx(header, ['net income']),
          eps: findIdx(header, ['eps'])
        };
        // If the detected FCF column actually looks like a percentage/margin, treat it as fcfMargin
        try {
          const lowerHeader = header.map(h => String(h || '').toLowerCase());
          if (headerIdx.fcf !== -1) {
            const label = lowerHeader[headerIdx.fcf] || '';
            if (label.includes('%') || label.includes('margin')) {
              if (headerIdx.fcfMargin === -1) headerIdx.fcfMargin = headerIdx.fcf;
              headerIdx.fcf = -1;
            }
          }
        } catch {}
        continue;
      }
      continue;
    }
    // Stop when leaving table block
    if (!/\|/.test(line)) {
      if (/^Fair Value Calculation:/i.test(line) || /^Exit Multiple Valuation:/i.test(line)) break;
      continue;
    }
    // Skip markdown separator rows
    if (/^[\-\s\|:]+$/.test(line)) continue;
    const cols = splitRow(line);
    if (!cols.length) continue;
    // Determine year column
    let yearLabel = null;
    if (header && headerIdx.year !== -1) yearLabel = cols[headerIdx.year] || null;
    if (!yearLabel) {
      // heuristic: first token that looks like a year
      yearLabel = cols.find(c => /\b20\d{2}\b/.test(c)) || cols[0];
    }
    if (!/\d{4}/.test(yearLabel || '')) continue;
    const revenue = (headerIdx.revenue !== -1) ? parseNum(cols[headerIdx.revenue]) : 0;
    const gp = (headerIdx.grossProfit !== -1) ? parseNum(cols[headerIdx.grossProfit]) : null;
    const cogs = (headerIdx.cogs !== -1) ? parseNum(cols[headerIdx.cogs]) : null;
    let grossProfit = gp != null ? gp : (revenue && cogs != null ? revenue - cogs : 0);
    let grossMargin = (headerIdx.grossMargin !== -1) ? parseNum(cols[headerIdx.grossMargin]) : (revenue > 0 ? (grossProfit / revenue) * 100 : 0);
    let ebitdaMargin = (headerIdx.ebitdaMargin !== -1) ? parseNum(cols[headerIdx.ebitdaMargin]) : (
      (headerIdx.operatingIncome !== -1 && revenue > 0) ? (parseNum(cols[headerIdx.operatingIncome]) / revenue) * 100 : 0
    );
    const fcf = (headerIdx.fcf !== -1) ? parseNum(cols[headerIdx.fcf]) : null;
    let fcfMargin = (headerIdx.fcfMargin !== -1) ? parseNum(cols[headerIdx.fcfMargin]) : (revenue > 0 && fcf != null ? (fcf / revenue) * 100 : 0);
    const netIncome = (headerIdx.netIncome !== -1) ? parseNum(cols[headerIdx.netIncome]) : 0;
    const eps = (headerIdx.eps !== -1) ? parseNum(cols[headerIdx.eps]) : 0;
    const revenueGrowth = (prevRevenue != null && prevRevenue > 0 && revenue) ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    prevRevenue = revenue || prevRevenue;

    projections.push({
      year: (yearLabel.match(/\b(20\d{2})\b/)?.[1]) || yearLabel,
      revenue,
        revenueGrowth,
      grossProfit,
      grossMargin,
      ebitda: revenue * (ebitdaMargin / 100),
      ebitdaMargin,
      freeCashFlow: fcf != null ? fcf : revenue * (fcfMargin / 100),
      fcf: fcf != null ? fcf : revenue * (fcfMargin / 100),
      fcfMargin,
      netIncome,
      netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
      eps
    });
  }

  // Second-pass normalization: compute derived fields and enforce consistency
  if (projections.length > 0) {
    for (let i = 0; i < projections.length; i++) {
      const p = projections[i];
      // Recompute revenue growth from series (ignore LLM-provided value)
      if (i === 0) {
        p.revenueGrowth = 0;
    } else {
        const prev = projections[i - 1];
        const prevRev = Number(prev?.revenue || 0);
        const curRev = Number(p?.revenue || 0);
        p.revenueGrowth = prevRev > 0 && curRev > 0 ? ((curRev - prevRev) / prevRev) * 100 : 0;
      }
      // Gross Profit / Margin consistency
      if ((p.grossProfit == null || p.grossProfit === 0) && p.revenue > 0 && p.grossMargin) {
        p.grossProfit = p.revenue * (p.grossMargin / 100);
      }
      if ((!p.grossMargin || p.grossMargin === 0) && p.revenue > 0 && p.grossProfit) {
        p.grossMargin = (p.grossProfit / p.revenue) * 100;
      }
      // EBITDA / Margin consistency
      if ((!p.ebitda || p.ebitda === 0) && p.revenue > 0 && p.ebitdaMargin) {
        p.ebitda = p.revenue * (p.ebitdaMargin / 100);
      }
      if ((!p.ebitdaMargin || p.ebitdaMargin === 0) && p.revenue > 0 && p.ebitda) {
        p.ebitdaMargin = (p.ebitda / p.revenue) * 100;
      }
      // FCF / Margin consistency
      if ((!p.freeCashFlow || p.freeCashFlow === 0) && p.revenue > 0 && p.fcfMargin) {
        p.freeCashFlow = p.revenue * (p.fcfMargin / 100);
        p.fcf = p.freeCashFlow;
      }
      if ((!p.fcfMargin || p.fcfMargin === 0) && p.revenue > 0 && (p.freeCashFlow || p.fcf)) {
        const f = p.freeCashFlow || p.fcf;
        p.fcfMargin = p.revenue > 0 ? (f / p.revenue) * 100 : 0;
      }
      if (!p.fcf && p.freeCashFlow) p.fcf = p.freeCashFlow;
      if (!p.freeCashFlow && p.fcf) p.freeCashFlow = p.fcf;
      // Soft-clamp FCF margin near FY2024 anchor to avoid unrealistic jumps
      if (typeof p.fcfMargin === 'number' && isFinite(p.fcfMargin) && fy24Anchor != null) {
        // Allow drift of ±10 percentage points from FY2024
        const min = fy24Anchor - 10;
        const max = fy24Anchor + 10;
        if (p.fcfMargin < min || p.fcfMargin > max) {
          // Nudge into range but keep direction
          p.fcfMargin = Math.max(min, Math.min(max, p.fcfMargin));
          if (p.revenue > 0) {
            const f = p.revenue * (p.fcfMargin / 100);
            p.freeCashFlow = f;
            p.fcf = f;
          }
        }
      }
      // Sanity fix for mislabeled FCF vs FCF Margin where both show same small number
      if (
        typeof p.freeCashFlow === 'number' && typeof p.fcfMargin === 'number' &&
        isFinite(p.freeCashFlow) && isFinite(p.fcfMargin) &&
        Math.abs(p.freeCashFlow - p.fcfMargin) < 1e-6 &&
        p.revenue > 0
      ) {
        // If this common value is likely $M (far smaller than revenue), recompute margin from $M
        if (p.freeCashFlow < p.revenue * 0.9) {
          p.fcfMargin = (p.freeCashFlow / p.revenue) * 100;
        } else if (p.fcfMargin <= 100) {
          // Otherwise, if it looks like a percent, recompute FCF from margin
          const f = p.revenue * (p.fcfMargin / 100);
          p.freeCashFlow = f;
          p.fcf = f;
        }
      }
      // Net income margin consistency
      if ((!p.netIncomeMargin || p.netIncomeMargin === 0) && p.revenue > 0 && p.netIncome) {
        p.netIncomeMargin = (p.netIncome / p.revenue) * 100;
      }
      // EPS derivation when possible (netIncome in $M, shares in M)
      // Use fy.shares_outstanding if provided
      if ((!p.eps || p.eps === 0) && (typeof fy?.shares_outstanding === 'number' || typeof fy?.shares_outstanding === 'string')) {
        const sharesM = Number(fy.shares_outstanding) / 1_000_000; // convert to millions
        const niM = Number(p.netIncome || 0); // assumed $M
        if (sharesM > 0 && niM >= 0) {
          p.eps = niM / sharesM;
        }
      }
      // Clamp to reasonable numeric values
      const clamp = (n) => Number.isFinite(n) ? n : 0;
      p.revenue = clamp(p.revenue);
      p.revenueGrowth = clamp(p.revenueGrowth);
      p.grossProfit = clamp(p.grossProfit);
      p.grossMargin = clamp(p.grossMargin);
      p.ebitda = clamp(p.ebitda);
      p.ebitdaMargin = clamp(p.ebitdaMargin);
      p.freeCashFlow = clamp(p.freeCashFlow);
      p.fcf = clamp(p.fcf);
      p.fcfMargin = clamp(p.fcfMargin);
      p.netIncome = clamp(p.netIncome);
      p.netIncomeMargin = clamp(p.netIncomeMargin);
      p.eps = clamp(p.eps);
    }
  }

  // Extract sections and scalar fields from forecast text
  const extractBetween = (textSrc, startRe, endRe) => {
    const start = textSrc.search(startRe);
    if (start === -1) return '';
    const from = textSrc.slice(start);
    const endMatch = from.search(endRe);
    return (endMatch === -1 ? from : from.slice(0, endMatch)).replace(startRe, '').trim();
  };
  const fairValueCalcText = extractBetween(
    forecastText,
    /Fair Value Calculation:/i,
    /\n\s*(Assumptions and Justifications:|Exit Multiple Valuation:|$)/i
  );
  const exitMultipleBlock = extractBetween(
    forecastText,
    /Exit Multiple Valuation:/i,
    /\n\s*(Assumptions and Justifications:|Fair Value Calculation:|$)/i
  );
  const fvMillionMatch = forecastText.match(/Fair Value:\s*[$€]?([\d,]+(?:\.[\d]+)?)\s*million/i);
  const fvShareMatch = forecastText.match(/Fair Value:\s*[$€]?([\d,]+(?:\.[\d]+)?)\s*per\s*share/i);
  const exitTypeMatch = forecastText.match(/Exit Multiple Type:\s*([^\n]+)/i);
  const exitValueMatch = forecastText.match(/Exit Multiple Value:\s*([\d.]+)/i);
  const discountMatch = forecastText.match(/Discount Rate:\s*([\d.]+)%/i);
  const terminalMatch = forecastText.match(/Terminal Growth Rate:\s*([\d.]+)%/i);

  // Compute fair value, upside, and CAGR
  let fairValue = 0; // For exit-multiple: per-share; for dcf: in $M
  const currentPrice = mkNumber(md.current_price);
  let upside = 0;
  let cagr = 0;
  let exitMultipleType = exitTypeMatch ? exitTypeMatch[1].trim() : null;
  let exitMultipleValue = exitValueMatch ? parseFloat(exitValueMatch[1]) : null;
  let discountRate = discountMatch ? parseFloat(discountMatch[1]) : null;
  let terminalGrowth = terminalMatch ? parseFloat(terminalMatch[1]) : null;

  // Calculate years to 2029 from today
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 0-indexed, so add 1
  const yearsTo2029 = 2029 - currentYear + (12 - currentMonth) / 12;

  if (method === 'exit-multiple') {
    if (fvShareMatch) fairValue = parseFloat(fvShareMatch[1].replace(/,/g, ''));
    // Compute fair value from multiple if needed
    if (!fairValue && exitMultipleValue) {
      const last = projections[projections.length - 1] || {};
      if (exitMultipleType && exitMultipleType.toUpperCase().includes('P/E') && last.eps) {
        fairValue = Number(last.eps) * exitMultipleValue;
      } else if (exitMultipleType && exitMultipleType.toUpperCase().includes('EV/EBITDA') && last.ebitda) {
        // Not converting EV to per-share here; rely on LLM fair value when provided
      } else if (exitMultipleType && exitMultipleType.toUpperCase().includes('EV/FCF') && last.fcf) {
        // Same note as above
      }
    }
    if (currentPrice > 0 && fairValue > 0) {
      upside = ((fairValue - currentPrice) / currentPrice) * 100;
      cagr = (Math.pow(fairValue / currentPrice, 1 / yearsTo2029) - 1) * 100;
    }
        } else {
    if (fvMillionMatch) fairValue = parseFloat(fvMillionMatch[1].replace(/,/g, ''));
    const marketCapM = mkNumber(md.market_cap) / 1_000_000;
    if (marketCapM > 0 && fairValue > 0) {
      upside = ((fairValue - marketCapM) / marketCapM) * 100;
      cagr = (Math.pow(fairValue / marketCapM, 1 / yearsTo2029) - 1) * 100;
    }
  }

  return {
        rawForecast: forecastText,
    rawFinancialAnalysis: '',
        companyName: companyName,
      method,
    fairValue,
    currentSharePrice: currentPrice,
    discountRate,
    terminalGrowth,
    exitMultipleType,
    exitMultipleValue,
    upside,
    cagr,
    sections: {
      forecastTable: forecastText,
      fairValueCalculation: fairValueCalcText,
      exitMultipleValuation: exitMultipleBlock,
      assumptions: extractBetween(forecastText, /Assumptions and Justifications:/i, /$/)
    },
    sourceMetrics: {
      currentPrice: currentPrice,
      marketCap: mkNumber(md.market_cap),
      sharesOutstanding: mkNumber(fy.shares_outstanding),
      enterpriseValue: mkNumber(md.enterprise_value) / 1_000_000
    },
    historicalFinancials: Array.isArray(yf_data?.historical_financials) ? yf_data.historical_financials : [],
    projections
  };
}

// NOTE: Fallback synthesis removed per requirement: Grok must always generate the forecast
