import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Simple in-memory rate limiter with request tracking
const rateLimiter = new Map();
const RATE_LIMIT = 40; // requests per minute (leave buffer for other routes)
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds
const activeRequests = new Set(); // Track active requests
const globalRateLimiter = new Map(); // Track global requests
const tokenUsageTracker = new Map(); // Track token usage per minute

function checkRateLimit(ticker) {
  const now = Date.now();
  const minuteAgo = now - RATE_WINDOW;
  
  // Clean up old entries
  for (const [timestamp] of rateLimiter) {
    if (timestamp < minuteAgo) {
      rateLimiter.delete(timestamp);
    }
  }
  
  for (const [timestamp] of globalRateLimiter) {
    if (timestamp < minuteAgo) {
      globalRateLimiter.delete(timestamp);
    }
  }
  
  for (const [timestamp] of tokenUsageTracker) {
    if (timestamp < minuteAgo) {
      tokenUsageTracker.delete(timestamp);
    }
  }
  
  // Check if there's already an active request for this ticker
  if (activeRequests.has(ticker)) {
    console.log(`Rate limit: Active request already exists for ${ticker}`);
    return false;
  }
  
  // Count global requests in the last minute
  const globalRecentRequests = Array.from(globalRateLimiter.keys())
    .filter(timestamp => timestamp > minuteAgo)
    .length;
  
  if (globalRecentRequests >= RATE_LIMIT) {
    console.log(`Rate limit: Global limit exceeded (${globalRecentRequests}/${RATE_LIMIT})`);
    return false;
  }
  
  // Count requests for this specific ticker in the last minute
  const recentRequests = Array.from(rateLimiter.keys())
    .filter(timestamp => timestamp > minuteAgo)
    .length;
  
  // Allow up to 3 requests per ticker per minute
  if (recentRequests >= 3) {
    console.log(`Rate limit: Ticker limit exceeded for ${ticker} (${recentRequests}/3)`);
    return false;
  }
  
  // Add current request
  rateLimiter.set(now, ticker);
  globalRateLimiter.set(now, true);
  activeRequests.add(ticker);
  
  console.log(`Rate limit: Request allowed for ${ticker} (Global: ${globalRecentRequests + 1}/${RATE_LIMIT}, Ticker: ${recentRequests + 1}/3)`);
  return true;
}

const generateValuation = async (ticker, method) => {
  try {
    // Add a small delay to prevent rapid successive requests
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('Generating valuation for:', { ticker, method });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `DCF for ${ticker}. FCF 5y, terminal = FCF×(1+g)/(r-g), discount. Return ONLY:

1. {"valuation":{"fairValue":number,"currentPrice":number,"upside":number,"confidence":"high|medium|low","method":"dcf","assumptions":{"growthRate":number,"terminalGrowth":number,"discountRate":number},"projections":[{"year":number,"revenue":number,"ebitda":number,"freeCashFlow":number,"capex":number,"workingCapital":number}]}}

2. {"analysis":{"companyOverview":string,"keyDrivers":string[],"risks":string[],"sensitivity":{"bullCase":number,"baseCase":number,"bearCase":number}}}

Current price. NO text. ONLY JSON.`;
    } else if (method === 'exit-multiple') {
      prompt = `DCF exit multiple for ${ticker}. FCF 5y, exit multiple terminal. Return ONLY:

1. {"valuation":{"fairValue":number,"currentPrice":number,"upside":number,"confidence":"high|medium|low","method":"exit-multiple","assumptions":{"growthRate":number,"discountRate":number,"exitMultiple":number,"exitMultipleType":"EV/EBITDA|P/E"},"projections":[{"year":number,"revenue":number,"ebitda":number,"freeCashFlow":number,"capex":number,"workingCapital":number}]}}

2. {"analysis":{"companyOverview":string,"keyDrivers":string[],"risks":string[],"sensitivity":{"bullCase":number,"baseCase":number,"bearCase":number}}}

Current price. NO text. ONLY JSON.`;
    } else if (method === 'comparable-multiples') {
      prompt = `Multiples for ${ticker}. P/E, EV/EBITDA, EV/Revenue peers. Return ONLY:

1. {"valuation":{"fairValue":number,"currentPrice":number,"upside":number,"confidence":"high|medium|low","method":"comparable-multiples","assumptions":{"peRatio":number,"evEbitdaRatio":number,"evRevenueRatio":number,"peerCount":number},"multiples":{"peRatio":number,"evEbitdaRatio":number,"evRevenueRatio":number,"priceToBook":number}}}

2. {"analysis":{"companyOverview":string,"keyDrivers":string[],"risks":string[],"sensitivity":{"bullCase":number,"baseCase":number,"bearCase":number}}}

Current price. NO text. ONLY JSON.`;
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
        max_tokens: 2000,
        system: "Return ONLY valid JSON. NO text. Get current stock price. Use web search.",
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
            max_uses: 5,
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
      
      if (error.error?.type === 'rate_limit_error' || response.status === 429) {
        // Remove from active requests so user can retry
        activeRequests.delete(ticker);
        throw new Error('Rate limit exceeded. Please wait 1-2 minutes and try again.');
      }
      
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

    // Check if the response starts with a JSON object
    if (!valuationText.trim().startsWith('{')) {
      console.error('Response does not start with JSON object:', valuationText.substring(0, 200));
      throw new Error('Invalid response format: Expected JSON object');
    }

    console.log('Raw valuation text length:', valuationText.length);
    
    // Parse the valuation data
    try {
      // Clean the response text
      let cleanText = valuationText
        .replace(/```json\n|\n```/g, '') // Remove markdown code blocks
        .replace(/\n\s*\/\/.*$/gm, '') // Remove single-line comments
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Ensure property names are quoted
        .replace(/,\s*\.\.\./g, '') // Remove trailing ellipsis
        .replace(/\.\.\./g, '') // Remove any remaining ellipsis
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      console.log('Cleaned text:', cleanText.substring(0, 200) + '...');

      // Split the text into two JSON objects
      const jsonParts = cleanText.split(/(?<=})\s*(?={)/);
      
      if (jsonParts.length !== 2) {
        console.error('Failed to split JSON objects:', {
          parts: jsonParts.length,
          firstPart: jsonParts[0]?.substring(0, 100),
          secondPart: jsonParts[1]?.substring(0, 100)
        });
        throw new Error('Expected two JSON objects but found ' + jsonParts.length);
      }

      // Parse each JSON object
      let valuationObj, analysisObj;
      try {
        valuationObj = JSON.parse(jsonParts[0]);
        analysisObj = JSON.parse(jsonParts[1]);
      } catch (parseError) {
        console.error('JSON parse error:', {
          error: parseError.message,
          firstPart: jsonParts[0]?.substring(0, 100),
          secondPart: jsonParts[1]?.substring(0, 100)
        });
        throw new Error('Failed to parse JSON objects: ' + parseError.message);
      }

      // Convert string numbers to actual numbers in valuation
      const convertNumbers = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        
        return Object.entries(obj).reduce((acc, [key, value]) => {
          if (typeof value === 'string' && !isNaN(parseFloat(value))) {
            acc[key] = parseFloat(value);
          } else if (Array.isArray(value)) {
            acc[key] = value.map(item => convertNumbers(item));
          } else if (typeof value === 'object' && value !== null) {
            acc[key] = convertNumbers(value);
          } else {
            acc[key] = value;
          }
          return acc;
        }, Array.isArray(obj) ? [] : {});
      };

      // Convert numbers in both objects
      const valuation = convertNumbers(valuationObj.valuation);
      const analysis = convertNumbers(analysisObj.analysis);

      console.log('Converted objects:', {
        valuation: valuation,
        analysis: analysis,
        analysisKeys: Object.keys(analysis),
        hasKeyDrivers: Array.isArray(analysis.keyDrivers),
        keyDriversLength: analysis.keyDrivers?.length,
        hasRisks: Array.isArray(analysis.risks),
        risksLength: analysis.risks?.length,
        sensitivity: analysis.sensitivity
      });

      // Generate Excel data
      const excelData = generateExcelData({
        valuation,
        analysis
      });

      // Return the data in the expected format
      const result = {
        valuation: {
          ...valuation,
          analysis,
          projections: valuation.projections,
          assumptions: valuation.assumptions,
          excelData: excelData
        },
        excelData
      };

      console.log('generateValuation result structure:', {
        hasValuation: !!result.valuation,
        hasAnalysis: !!result.valuation.analysis,
        analysisKeys: Object.keys(result.valuation.analysis),
        keyDriversLength: result.valuation.analysis.keyDrivers?.length,
        risksLength: result.valuation.analysis.risks?.length,
        companyOverview: result.valuation.analysis.companyOverview?.substring(0, 50) + '...'
      });

      return result;
    } catch (parseError) {
      console.error('Failed to parse valuation data:', {
        error: parseError.message,
        rawTextLength: valuationText.length,
        rawTextPreview: valuationText.substring(0, 200) + '...'
      });
      throw new Error(`Failed to parse valuation data: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in generateValuation:', {
      ticker,
      method,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    // Always remove the ticker from active requests when done
    activeRequests.delete(ticker);
  }
};

function generateExcelData(valuation) {
  // Extract the valuation data from the nested structure
  const valuationData = valuation.valuation || valuation;
  const analysis = valuationData.analysis || valuationData.analysis;
  const method = valuationData.method || 'dcf';

  // Create Excel data structure
  let sheets = [
    {
      name: 'Valuation Summary',
      data: [
        ['Valuation Summary'],
        ['Fair Value', valuationData.fairValue],
        ['Current Price', valuationData.currentPrice],
        ['Upside', valuationData.upside],
        ['Confidence', valuationData.confidence],
        ['Method', valuationData.method],
        [],
        ['Assumptions']
      ]
    }
  ];

  // Add method-specific assumptions
  if (method === 'dcf') {
    sheets[0].data.push(
      ['Growth Rate', valuationData.assumptions?.growthRate || 0],
      ['Terminal Growth', valuationData.assumptions?.terminalGrowth || 0],
      ['Discount Rate', valuationData.assumptions?.discountRate || 0]
    );
  } else if (method === 'exit-multiple') {
    sheets[0].data.push(
      ['Growth Rate', valuationData.assumptions?.growthRate || 0],
      ['Discount Rate', valuationData.assumptions?.discountRate || 0],
      ['Exit Multiple', valuationData.assumptions?.exitMultiple || 0],
      ['Exit Multiple Type', valuationData.assumptions?.exitMultipleType || 'N/A']
    );
  } else if (method === 'comparable-multiples') {
    sheets[0].data.push(
      ['P/E Ratio', valuationData.assumptions?.peRatio || 0],
      ['EV/EBITDA Ratio', valuationData.assumptions?.evEbitdaRatio || 0],
      ['EV/Revenue Ratio', valuationData.assumptions?.evRevenueRatio || 0],
      ['Peer Count', valuationData.assumptions?.peerCount || 0]
    );
  }

  // Add sensitivity analysis
  sheets[0].data.push(
    [],
    ['Sensitivity Analysis'],
    ['Bull Case', analysis?.sensitivity?.bullCase || 0],
    ['Base Case', analysis?.sensitivity?.baseCase || 0],
    ['Bear Case', analysis?.sensitivity?.bearCase || 0]
  );

  // Add projections sheet for DCF and exit-multiple methods
  if (method === 'dcf' || method === 'exit-multiple') {
    sheets.push({
      name: 'Projections',
      data: [
        ['Year', 'Revenue', 'EBITDA', 'Free Cash Flow', 'Capex', 'Working Capital'],
        ...(valuationData.projections || []).map(p => [
          p.year,
          p.revenue,
          p.ebitda,
          p.freeCashFlow,
          p.capex,
          p.workingCapital
        ])
      ]
    });
  }

  // Add multiples sheet for comparable-multiples method
  if (method === 'comparable-multiples') {
    sheets.push({
      name: 'Multiples',
      data: [
        ['Multiple Type', 'Value'],
        ['P/E Ratio', valuationData.multiples?.peRatio || 0],
        ['EV/EBITDA Ratio', valuationData.multiples?.evEbitdaRatio || 0],
        ['EV/Revenue Ratio', valuationData.multiples?.evRevenueRatio || 0],
        ['Price to Book', valuationData.multiples?.priceToBook || 0]
      ]
    });
  }

  // Add analysis sheet
  sheets.push({
    name: 'Analysis',
    data: [
      ['Company Overview'],
      [analysis?.companyOverview || 'No overview available'],
      [],
      ['Key Drivers'],
      ...(analysis?.keyDrivers || []).map(d => [d]),
      [],
      ['Risks'],
      ...(analysis?.risks || []).map(r => [r])
    ]
  });

  return sheets;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const method = searchParams.get('method') || 'dcf';

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

  // Check rate limit
  if (!checkRateLimit(ticker)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in 1 minute.' },
      { status: 429 }
    );
  }

  try {
    // Generate valuation
    const valuation = await generateValuation(ticker, method);
    
    // Validate the valuation structure
    if (!valuation || !valuation.valuation) {
      console.error('Invalid valuation structure:', valuation);
      return NextResponse.json(
        { error: 'Invalid valuation data structure' },
        { status: 422 }
      );
    }

    // Generate Excel data
    const excelData = generateExcelData(valuation);

    // Ensure all required fields are present and properly structured
    const formattedValuation = {
      fairValue: parseFloat(valuation.valuation.fairValue),
      currentPrice: parseFloat(valuation.valuation.currentPrice),
      upside: parseFloat(valuation.valuation.upside),
      confidence: valuation.valuation.confidence,
      method: valuation.valuation.method,
      analysis: valuation.valuation.analysis || {
        companyOverview: 'No overview available',
        keyDrivers: [],
        risks: [],
        sensitivity: {
          bullCase: 0,
          baseCase: 0,
          bearCase: 0
        }
      },
      excelData: excelData
    };

    // Add method-specific data
    if (method === 'dcf') {
      formattedValuation.projections = (valuation.valuation.projections || []).map(p => ({
        year: parseInt(p.year),
        revenue: parseFloat(p.revenue),
        ebitda: parseFloat(p.ebitda),
        freeCashFlow: parseFloat(p.freeCashFlow),
        capex: parseFloat(p.capex),
        workingCapital: parseFloat(p.workingCapital)
      }));
      formattedValuation.assumptions = {
        growthRate: parseFloat(valuation.valuation.assumptions?.growthRate || 0),
        terminalGrowth: parseFloat(valuation.valuation.assumptions?.terminalGrowth || 0),
        discountRate: parseFloat(valuation.valuation.assumptions?.discountRate || 0)
      };
    } else if (method === 'exit-multiple') {
      formattedValuation.projections = (valuation.valuation.projections || []).map(p => ({
        year: parseInt(p.year),
        revenue: parseFloat(p.revenue),
        ebitda: parseFloat(p.ebitda),
        freeCashFlow: parseFloat(p.freeCashFlow),
        capex: parseFloat(p.capex),
        workingCapital: parseFloat(p.workingCapital)
      }));
      formattedValuation.assumptions = {
        growthRate: parseFloat(valuation.valuation.assumptions?.growthRate || 0),
        discountRate: parseFloat(valuation.valuation.assumptions?.discountRate || 0),
        exitMultiple: parseFloat(valuation.valuation.assumptions?.exitMultiple || 0),
        exitMultipleType: valuation.valuation.assumptions?.exitMultipleType || 'N/A'
      };
    } else if (method === 'comparable-multiples') {
      formattedValuation.assumptions = {
        peRatio: parseFloat(valuation.valuation.assumptions?.peRatio || 0),
        evEbitdaRatio: parseFloat(valuation.valuation.assumptions?.evEbitdaRatio || 0),
        evRevenueRatio: parseFloat(valuation.valuation.assumptions?.evRevenueRatio || 0),
        peerCount: parseInt(valuation.valuation.assumptions?.peerCount || 0)
      };
      formattedValuation.multiples = {
        peRatio: parseFloat(valuation.valuation.multiples?.peRatio || 0),
        evEbitdaRatio: parseFloat(valuation.valuation.multiples?.evEbitdaRatio || 0),
        evRevenueRatio: parseFloat(valuation.valuation.multiples?.evRevenueRatio || 0),
        priceToBook: parseFloat(valuation.valuation.multiples?.priceToBook || 0)
      };
    }

    console.log('Formatted valuation analysis:', {
      companyOverview: formattedValuation.analysis.companyOverview,
      keyDriversLength: formattedValuation.analysis.keyDrivers.length,
      risksLength: formattedValuation.analysis.risks.length,
      sensitivity: formattedValuation.analysis.sensitivity
    });

    return NextResponse.json({
      valuation: formattedValuation,
      excelData
    });
  } catch (error) {
    console.error('Error generating valuation:', error);

    // Handle specific error cases
    if (error.message.includes('not found')) {
      return NextResponse.json(
        { error: `No data found for ${ticker}` },
        { status: 404 }
      );
    }

    if (error.message.includes('rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in 1 minute.' },
        { status: 429 }
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
  } finally {
    // Always remove the ticker from active requests when done
    activeRequests.delete(ticker);
  }
} 