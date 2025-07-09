import { NextResponse } from 'next/server';

export const runtime = 'edge';

const generateValuation = async (ticker, method, selectedMultiple = 'auto') => {
  try {
    console.log('Generating valuation for:', { ticker, method, selectedMultiple });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `DCF ${ticker}. Return ONLY JSON with this structure:
{
  "valuation": {
    "current_price": X,
    "dcf_value": X,
    "upside": X,
    "assumptions": {
      "revenueGrowthRate": X,
      "terminalGrowthRate": X,
      "discountRate": X,
      "fcfMargin": X
    },
    "projections": [
      // Repeat the following object for each year 2025-2029:
      {
        "year": YEAR,
        "revenue": X,
        "freeCashFlow": X,
        "ebitda": X,
        "capex": X,
        "workingCapital": X
      }
    ]
  },
  "analysis": {
    "companyOverview": "...",
    "keyDrivers": ["...", "..."],
    "risks": ["...", "..."],
    "sensitivity": {
      "bullCase": X,
      "baseCase": X,
      "bearCase": X
    }
  }
}
Projections must be for years 2025, 2026, 2027, 2028, and 2029.`;
    } else if (method === 'exit-multiple') {
      // Determine the appropriate multiple type based on industry and user selection
      let multipleTypeInstruction = '';
      
      if (selectedMultiple === 'auto') {
        multipleTypeInstruction = `Choose the most appropriate exit multiple based on industry:
- P/E: Consumer staples, Healthcare, Retail, Financials
- EV/FCF: Software (mature stage), Industrial compounders, Capital-light consumer businesses, High FCF-yield investors
- EV/EBITDA: Industrial conglomerates, Telecoms, Infrastructure, Manufacturing
- EV/Sales: High-growth firms with negative or erratic earnings`;

      } else {
        multipleTypeInstruction = `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      }
      
      prompt = `DCF exit multiple ${ticker}. Return ONLY JSON with this structure:
{
  "valuation": {
    "current_price": X,
    "current_ev": X,
    "assumptions": {
      "growthRate": X,
      "discountRate": X,
      "exitMultiple": X,
      "exitMultipleType": "...",
      "enterpriseValue": X
    },
    "projections": [
      // Repeat the following object for each year 2025-2029:
      {
        "year": YEAR,
        "revenue": X,
        "freeCashFlow": X,
        "ebitda": X,
        "netIncome": X,
        "eps": X,
        "capex": X,
        "workingCapital": X
      }
    ]
  },
  "analysis": {
    "companyOverview": "...",
    "keyDrivers": ["...", "..."],
    "risks": ["...", "..."],
    "sensitivity": {
      "bullCase": X,
      "baseCase": X,
      "bearCase": X
    },
    "multipleExplanation": "..."
  }
}
Projections must be for years 2025, 2026, 2027, 2028, and 2029. Include EBITDA, Net Income, and EPS for multiple analysis.

${multipleTypeInstruction}

CRITICAL: If you use EV/EBITDA or EV/FCF, get the MOST CURRENT and UPDATED current_ev (current enterprise value) from recent market data. Do not use outdated or estimated values. Search for the latest EV information.`;
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
        system: `Return ONLY JSON. NO text. NO explanations. Get CURRENT data.`,
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

    // Extract JSON objects from the response, regardless of position
    let jsonObjects = [];
    
    // First try to extract from markdown code blocks
    const jsonMatches = valuationText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g);
    if (jsonMatches) {
      jsonMatches.forEach(match => {
        const jsonStr = match.replace(/```(?:json)?\s*/, '').replace(/\s*```/, '');
        try {
          JSON.parse(jsonStr);
          jsonObjects.push(jsonStr);
        } catch (e) {
          // Not valid JSON, continue
        }
      });
    }
    
    // If no markdown blocks, try to parse the entire text as JSON first
    if (jsonObjects.length === 0) {
      try {
        const parsed = JSON.parse(valuationText);
        jsonObjects.push(valuationText);
      } catch (e) {
        // Not a single JSON object, try to find multiple objects
        let braceCount = 0;
        let startIndex = -1;
        
        for (let i = 0; i < valuationText.length; i++) {
          if (valuationText[i] === '{') {
            if (braceCount === 0) {
              startIndex = i;
            }
            braceCount++;
          } else if (valuationText[i] === '}') {
            braceCount--;
            if (braceCount === 0 && startIndex !== -1) {
              const jsonStr = valuationText.substring(startIndex, i + 1);
              try {
                JSON.parse(jsonStr);
                jsonObjects.push(jsonStr);
              } catch (e) {
                // Not valid JSON, continue
              }
              startIndex = -1;
            }
          }
        }
      }
    }
    
    if (jsonObjects.length === 0) {
      console.error('No JSON objects found in response. Full response:', valuationText);
      
      // Try to fix incomplete JSON by adding missing closing braces
      let fixedText = valuationText;
      if (fixedText.includes('"sensitivity"') && !fixedText.includes('"multipleExplanation"')) {
        // Add missing multipleExplanation and closing braces
        fixedText = fixedText.replace(/}$/, '') + 
          ',\n    "multipleExplanation": "Multiple selected based on industry standards and company characteristics."\n  }\n}';
      } else if (fixedText.includes('"analysis"') && !fixedText.includes('}')) {
        // Add missing closing braces
        fixedText = fixedText + '\n}';
      }
      
      try {
        JSON.parse(fixedText);
        jsonObjects.push(fixedText);
        console.log('Successfully fixed incomplete JSON response');
      } catch (e) {
        console.error('Failed to fix JSON:', e);
        throw new Error('Invalid response format: No JSON objects found');
      }
    }
    
    // Use the found JSON objects
    if (jsonObjects.length === 1) {
      valuationText = jsonObjects[0];
    } else {
      valuationText = jsonObjects.join('\n');
    }

    console.log('Raw valuation text length:', valuationText.length);
    
    // Parse the valuation data
    try {
      // Clean the response text
      let cleanText = valuationText
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      console.log('Cleaned text:', cleanText.substring(0, 200) + '...');

      // Split the text into two JSON objects
      const jsonParts = cleanText.split(/(?<=})\s*(?={)/);
      
      let valuationObj, analysisObj;
      
      if (jsonParts.length === 2) {
        // Two separate JSON objects
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
      } else if (jsonParts.length === 1) {
        // Single JSON object with nested properties
        try {
          const singleObj = JSON.parse(jsonParts[0]);
          if (singleObj.valuation && singleObj.analysis) {
            valuationObj = { valuation: singleObj.valuation };
            analysisObj = { analysis: singleObj.analysis };
          } else {
            throw new Error('Single JSON object does not contain both valuation and analysis');
          }
        } catch (parseError) {
          console.error('JSON parse error for single object:', {
            error: parseError.message,
            firstPart: jsonParts[0]?.substring(0, 100)
          });
          throw new Error('Failed to parse JSON object: ' + parseError.message);
        }
      } else {
        console.error('Failed to split JSON objects:', {
          parts: jsonParts.length,
          firstPart: jsonParts[0]?.substring(0, 100),
          secondPart: jsonParts[1]?.substring(0, 100)
        });
        throw new Error('Expected one or two JSON objects but found ' + jsonParts.length);
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

      console.log('Raw valuation fields:', Object.keys(valuation));
      console.log('Raw analysis fields:', Object.keys(analysis));
      console.log('Raw projections data:', valuation.projections);
      console.log('Raw assumptions data:', valuation.assumptions);
      console.log('Raw sensitivity data:', analysis.sensitivity);

      // Normalize field names and ensure all required fields are present
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
        multipleExplanation: method === 'exit-multiple' ? analysis.multipleExplanation || 'No explanation provided' : null
      };

      console.log('Converted objects:', {
        valuation: valuation,
        analysis: normalizedAnalysis,
        analysisKeys: Object.keys(normalizedAnalysis),
        hasKeyDrivers: Array.isArray(normalizedAnalysis.keyDrivers),
        keyDriversLength: normalizedAnalysis.keyDrivers?.length,
        hasRisks: Array.isArray(normalizedAnalysis.risks),
        risksLength: normalizedAnalysis.risks?.length,
        sensitivity: normalizedAnalysis.sensitivity
      });

      // Generate Excel data
      const excelData = generateExcelData({
        valuation,
        analysis: normalizedAnalysis
      });

      // Return the data in the expected format
      const result = {
        valuation: {
          ...valuation,
          analysis: normalizedAnalysis,
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
    multipleExplanation: method === 'exit-multiple' ? analysis.multipleExplanation || 'No explanation provided' : null
  };

  // Create Excel data structure
  let sheets = [
    {
      name: 'Valuation Summary',
      data: [
        ['Valuation Summary'],
        ['Fair Value', valuationData.fairValue || valuationData.fair_value || valuationData.dcf_value || valuationData.dcf_fair_value || valuationData.fair_value_per_share || valuationData.target_price || valuationData.gf_value || valuationData.intrinsic_value_per_share || 0],
        ['Current Price', valuationData.currentPrice || valuationData.current_price || 0],
        ...(method === 'exit-multiple' && valuationData.currentEV && 
            valuationData.assumptions?.exitMultipleType && 
            (valuationData.assumptions.exitMultipleType === 'EV/EBITDA' || valuationData.assumptions.exitMultipleType === 'EV/FCF') 
            ? [['Current EV (M)', (valuationData.currentEV / 1000).toFixed(1)]] : []),
        ['Upside', valuationData.upside || valuationData.upside_downside || valuationData.upside_potential || valuationData.gf_upside || 0],
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

  // Add sensitivity analysis
  sheets[0].data.push(
    [],
    ['Sensitivity Analysis'],
    ['Bull Case', normalizedAnalysis.sensitivity?.bullCase || 0],
    ['Base Case', normalizedAnalysis.sensitivity?.baseCase || 0],
    ['Bear Case', normalizedAnalysis.sensitivity?.bearCase || 0]
  );

  // Add projections sheet for DCF and exit-multiple methods
  if (method === 'dcf' || method === 'exit-multiple') {
    const projectionHeaders = ['Year', 'Revenue (M)', 'Free Cash Flow (M)'];
    const projectionData = (valuationData.projections || []).map(p => [
      p.year,
      (p.revenue / 1000000).toFixed(1),
      ((p.fcf || p.freeCashFlow) / 1000000).toFixed(1)
    ]);
    
    // Add additional columns for exit-multiple method
    if (method === 'exit-multiple') {
      projectionHeaders.push('EBITDA (M)', 'Net Income (M)', 'EPS');
      projectionData.forEach((row, index) => {
        const projection = valuationData.projections[index];
        row.push(
          (projection.ebitda / 1000000).toFixed(1),
          (projection.netIncome / 1000000).toFixed(1),
          projection.eps.toFixed(2)
        );
      });
    } else {
      // For DCF, add the original columns
      projectionHeaders.push('EBITDA (M)', 'Capex (M)', 'Working Capital (M)');
      projectionData.forEach((row, index) => {
        const projection = valuationData.projections[index];
        row.push(
          (projection.ebitda / 1000000).toFixed(1),
          (projection.capex / 1000000).toFixed(1),
          (projection.workingCapital / 1000000).toFixed(1)
        );
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
  const exitType = assumptions.exitMultipleType;
  
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
    // Generate valuation
    const valuation = await generateValuation(ticker, method, selectedMultiple);
    
    // Validate the valuation structure
    if (!valuation || !valuation.valuation) {
      console.error('Invalid valuation structure:', valuation);
      return NextResponse.json(
        { error: 'Invalid valuation data structure' },
        { status: 422 }
      );
    }

    // Ensure all required fields are present and properly structured
    const formattedValuation = {
      fairValue: parseFloat(valuation.valuation.fairValue || 
                           valuation.valuation.fair_value ||
                           valuation.valuation.dcf_value || 
                           valuation.valuation.dcf_fair_value || 
                           valuation.valuation.fair_value_per_share ||
                           valuation.valuation.target_price ||
                           valuation.valuation.gf_value ||
                           valuation.valuation.intrinsic_value_per_share || 0),
      currentPrice: parseFloat(valuation.valuation.currentPrice || 
                              valuation.valuation.current_price || 0),
      currentEV: parseFloat(valuation.valuation.current_ev || 
                           valuation.valuation.currentEv || 0),
      upside: parseFloat(valuation.valuation.upside || 
                        valuation.valuation.upside_downside || 
                        valuation.valuation.upside_potential ||
                        valuation.valuation.gf_upside || 0),
      confidence: valuation.valuation.confidence || valuation.valuation.recommendation || valuation.valuation.analyst_consensus || 'Medium',
      method: valuation.valuation.method || method,
      analysis: {
        companyOverview: (valuation.valuation.analysis?.companyOverview || 'No overview available')
          .replace(/<cite[^>]*>.*?<\/cite>/g, '') // Remove citation tags
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim(),
        keyDrivers: Array.isArray(valuation.valuation.analysis?.keyDrivers) ? 
                   valuation.valuation.analysis.keyDrivers.map(driver => 
                     typeof driver === 'string' ? 
                       driver.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim() : driver
                   ) : [],
        risks: Array.isArray(valuation.valuation.analysis?.risks) ? 
               valuation.valuation.analysis.risks.map(risk => 
                 typeof risk === 'string' ? 
                   risk.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim() : risk
               ) : 
               (typeof valuation.valuation.analysis?.risks === 'object' && valuation.valuation.analysis?.risks !== null) ? 
               Object.keys(valuation.valuation.analysis.risks).map(key => 
                 `${key}: ${valuation.valuation.analysis.risks[key]}`.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim()
               ) : [],
        sensitivity: {
          bullCase: parseFloat(valuation.valuation.analysis?.sensitivity?.bullCase || 
                              valuation.valuation.analysis?.sensitivity?.bull_case || 0),
          baseCase: parseFloat(valuation.valuation.analysis?.sensitivity?.baseCase || 
                              valuation.valuation.analysis?.sensitivity?.base_case || 0),
          bearCase: parseFloat(valuation.valuation.analysis?.sensitivity?.bearCase || 
                              valuation.valuation.analysis?.sensitivity?.bear_case || 0)
        }
      }
    };

    // Add method-specific data
    if (method === 'dcf') {
      formattedValuation.projections = (valuation.valuation.projections || []).map(p => ({
        year: parseInt(p.year),
        revenue: parseFloat(p.revenue),
        freeCashFlow: parseFloat(p.freeCashFlow),
        fcf: parseFloat(p.freeCashFlow), // Also map to fcf for frontend compatibility
        ebitda: parseFloat(p.ebitda),
        capex: parseFloat(p.capex),
        workingCapital: parseFloat(p.workingCapital)
      }));
      
      // Fallback: If projections is empty, add a dummy row
      if (!formattedValuation.projections || formattedValuation.projections.length === 0) {
        formattedValuation.projections = [{
          year: new Date().getFullYear(),
          revenue: 0,
          freeCashFlow: 0,
          ebitda: 0,
          capex: 0,
          workingCapital: 0
        }];
      }
      
      formattedValuation.assumptions = {
        revenueGrowthRate: parseFloat(valuation.valuation.assumptions?.revenueGrowthRate || 
                                    valuation.valuation.assumptions?.fcfGrowthRate5yr || 
                                    valuation.valuation.assumptions?.revenue_growth ||
                                    valuation.valuation.revenue_growth ||
                                    (Array.isArray(valuation.valuation.assumptions?.revenueGrowth) ? 
                                     valuation.valuation.assumptions.revenueGrowth[0] : 0) || 0) / 100,
        terminalGrowthRate: parseFloat(valuation.valuation.assumptions?.terminalGrowthRate || 
                                     valuation.valuation.assumptions?.terminal_growth_rate ||
                                     valuation.valuation.terminal_growth_rate || 0) / 100,
        discountRate: parseFloat(valuation.valuation.assumptions?.discountRate || 
                               valuation.valuation.assumptions?.wacc ||
                               valuation.valuation.assumptions?.discount_rate ||
                               valuation.valuation.wacc ||
                               valuation.valuation.discount_rate || 0) / 100,
        fcfMargin: parseFloat(valuation.valuation.assumptions?.fcfMargin || 
                            valuation.valuation.assumptions?.fcf_margin || 0) / 100,
        taxRate: parseFloat(valuation.valuation.assumptions?.taxRate || 0) / 100,
        // Also include the original field names for flexibility
        wacc: parseFloat(valuation.valuation.assumptions?.wacc || 
                        valuation.valuation.wacc || 0) / 100,
        fcfGrowthRate5yr: parseFloat(valuation.valuation.assumptions?.fcfGrowthRate5yr || 0) / 100,
        revenueGrowth: valuation.valuation.assumptions?.revenueGrowth || []
      };
    } else if (method === 'exit-multiple') {
      formattedValuation.projections = (valuation.valuation.projections || []).map(p => ({
        year: parseInt(p.year),
        revenue: parseFloat(p.revenue),
        freeCashFlow: parseFloat(p.freeCashFlow),
        fcf: parseFloat(p.freeCashFlow), // Also map to fcf for frontend compatibility
        ebitda: parseFloat(p.ebitda),
        netIncome: parseFloat(p.netIncome),
        eps: parseFloat(p.eps),
        capex: parseFloat(p.capex),
        workingCapital: parseFloat(p.workingCapital)
      }));
      
      // Fallback: If projections is empty, add a dummy row
      if (!formattedValuation.projections || formattedValuation.projections.length === 0) {
        formattedValuation.projections = [{
          year: new Date().getFullYear(),
          revenue: 0,
          freeCashFlow: 0,
          ebitda: 0,
          netIncome: 0,
          eps: 0,
          capex: 0,
          workingCapital: 0
        }];
      }
      
      formattedValuation.assumptions = {
        exitMultiple: parseFloat(valuation.valuation.assumptions?.exitMultiple || 0),
        exitMultipleType: valuation.valuation.assumptions?.exitMultipleType || 'N/A',
        enterpriseValue: valuation.valuation.assumptions?.enterpriseValue || 0
      };
      
      // Calculate fair value ourselves using exit multiple
      const { fairValue, upside } = calculateExitMultipleValue(
        formattedValuation.projections,
        formattedValuation.assumptions,
        formattedValuation.currentPrice,
        formattedValuation.currentEV
      );
      
      // Override Claude's values with our calculated values
      formattedValuation.fairValue = fairValue;
      formattedValuation.upside = upside;
      
      // Convert sensitivity values to EV-based for EV multiples
      if (formattedValuation.assumptions.exitMultipleType === 'EV/EBITDA' || 
          formattedValuation.assumptions.exitMultipleType === 'EV/FCF') {
        // Convert sensitivity values from per-share to EV values (multiply by 1000 for display)
        formattedValuation.analysis.sensitivity.bullCase = formattedValuation.analysis.sensitivity.bullCase * 1000;
        formattedValuation.analysis.sensitivity.baseCase = formattedValuation.analysis.sensitivity.baseCase * 1000;
        formattedValuation.analysis.sensitivity.bearCase = formattedValuation.analysis.sensitivity.bearCase * 1000;
      }
    }

    // Generate Excel data with the properly formatted valuation
    const excelData = generateExcelData({
      valuation: formattedValuation,
      analysis: formattedValuation.analysis
    });
    
    // Add excelData to the formatted valuation
    formattedValuation.excelData = excelData;

    console.log('Formatted valuation analysis:', {
      companyOverview: formattedValuation.analysis.companyOverview,
      keyDriversLength: formattedValuation.analysis.keyDrivers?.length || 0,
      risksLength: formattedValuation.analysis.risks?.length || 0,
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