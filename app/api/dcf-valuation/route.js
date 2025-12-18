import { NextResponse } from 'next/server';
import { generateStandardForecast } from '../../../services/gemini-forecast';

// Legacy endpoint that adapts the new Service Architecture to the old Frontend format
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const method = searchParams.get('method') || 'exit-multiple';
    const targetMultiple = searchParams.get('multiple');
    const { feedback } = await request.json().catch(() => ({ feedback: '' }));

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    // Call the new architecture service
    console.log(`[LegacyAdapter] Routing request for ${ticker} to new Gemini Service...`);

    // Inject strict override if multiple is selected via UI
    const effectiveFeedback = (targetMultiple ? `Use Exit Multiple Type: "${targetMultiple}". ` : "") + (feedback || "");

    // Extract headers to bypass Vercel Authentication on internal calls
    const headers = {};
    if (request.headers.get('cookie')) headers['cookie'] = request.headers.get('cookie');
    if (request.headers.get('authorization')) headers['authorization'] = request.headers.get('authorization');

    const serviceResult = await generateStandardForecast(ticker, ticker, {
      feedback: effectiveFeedback,
      headers // Pass headers down
    });

    if (!serviceResult.forecast) {
      console.error('[LegacyAdapter] Service failed:', serviceResult.metadata?.error);
      return NextResponse.json({ error: serviceResult.metadata?.error || 'Forecast generation failed' }, { status: 500 });
    }

    // ADAPT to LEGACY FORMAT
    const { forecast, metadata } = serviceResult;
    const { projections, dcf, assumptions, key_drivers, dataQuality, validation } = forecast;

    // 1. Convert Projections Object -> Array (sorted) & Enrich (Calculate missing values)
    const sortedYears = Object.keys(projections).sort();
    const projectionsArray = sortedYears.map(year => {
      const p = projections[year];

      // Fix Growth Units: If decimal (0.05), convert to percent (5.0)
      let revenueGrowth = p.revenueGrowth;
      if (revenueGrowth !== null && Math.abs(revenueGrowth) < 2.0 && Math.abs(revenueGrowth) !== 0) {
        revenueGrowth = revenueGrowth * 100;
      }

      // Fix Margin Units: If decimal (0.25), convert to percent (25.0)
      const normalizeMargin = (m) => (m !== null && Math.abs(m) <= 1.0 && Math.abs(m) !== 0) ? m * 100 : m;

      // Calculate missing absolute metrics from margins if needed
      const revenue = Number(p.revenue || 0);
      const grossMargin = Number(normalizeMargin(p.grossMargin) || 0);
      const ebitdaMargin = Number(normalizeMargin(p.ebitdaMargin) || 0);
      const netIncomeMargin = Number(normalizeMargin(p.netIncomeMargin) || (p.netIncome / revenue * 100) || 0);

      // Fallback: If FCF Margin is 0, use Net Income Margin as proxy or Historical Avg
      // Also normalize it if provided
      let rawFcfMargin = p.fcfMargin;
      if (rawFcfMargin !== null && Math.abs(rawFcfMargin) <= 1.0 && Math.abs(rawFcfMargin) !== 0) rawFcfMargin *= 100;

      const fcfMargin = Number(rawFcfMargin || (netIncomeMargin * 0.9) || 10);

      // Explicitly calculate absolute values for frontend charts
      // Frontend expects: grossProfit, ebitda, fcf, netIncome, eps
      return {
        year,
        ...p,
        revenue,
        revenueGrowth,

        // Calculated Absolutes
        grossProfit: p.grossProfit || (revenue * (grossMargin / 100)),
        ebitda: p.ebitda || (revenue * (ebitdaMargin / 100)),
        fcf: p.fcf || p.freeCashFlow || (revenue * (fcfMargin / 100)),
        freeCashFlow: p.fcf || p.freeCashFlow || (revenue * (fcfMargin / 100)), // Alias
        netIncome: p.netIncome || (revenue * (netIncomeMargin / 100)),

        // Ensure margins are set
        grossMargin,
        ebitdaMargin,
        fcfMargin,
        netIncomeMargin
      };
    });

    // 2. Synthesize "Sections" text
    let assumptionsText = "Assumptions based on robust analysis:\n\n";
    if (assumptions && Array.isArray(assumptions)) {
      assumptionsText += assumptions.map(a =>
        `• ${a.category}: ${a.assumption} (${a.confidence || 'Medium'} Confidence)`
      ).join('\n');
    }
    assumptionsText += `\n\nKey Drivers:\n• Growth: ${key_drivers?.growth?.factor || 'N/A'}\n• Profitability: ${key_drivers?.profitability?.factor || 'N/A'}\n• Risks: ${key_drivers?.risk?.factor || 'N/A'}`;

    if (feedback) {
      assumptionsText += `\n\nUser Feedback Incorporated: "${feedback}"`;
    }

    // 2b. Construct Exit Multiple Calculation Object (Required for Top Row Cards)
    // We infer the multiple if not explicitly provided in 'dcf'
    const terminalYear = projectionsArray[projectionsArray.length - 1];

    // Use LLM's chosen type and value if available
    let multipleType = dcf.exitMultipleType || "P/E";
    // Frontend expects "P/E", "EV/EBITDA", "EV/FCF"
    if (multipleType === "PE") multipleType = "P/E";

    const multipleUsed = dcf.exitMultipleValue || dcf.impliedForwardPE || 20;

    // --- MATHEMATICAL CONSISTENCY OVERRIDE ---
    // Recalculate Fair Value and Upside to ensure they match the Projections + Multiple + Discount Rate exactly.
    // This prevents "LLM Hallucination" where inputs don't match output.

    // --- VALUATION METHOD BIFURCATION ---
    // If user requested 'dcf' (Perpetuity), utilize Discounted Cash Flow.
    // If user requested 'exit-multiple', utilize Undiscounted Target Price.

    // We determine the active method passed via query param (or default to exit-multiple)
    const activeMethod = (method === 'dcf') ? 'dcf' : 'exit-multiple';

    let presentFairValue = 0;
    let impliedEnterpriseValue = 0; // Outer Declaration
    let valuationDetails = "";

    // Common Setup
    const yearsToTerminal = projectionsArray.length - 1 || 5;
    let discountRate = dcf.discountRate;
    if (discountRate < 1.0 && discountRate > 0) discountRate = discountRate * 100;
    if (!discountRate || discountRate === 0) discountRate = 9.0;

    // Calculate Net Debt (Shared)
    const currentEV = forecast.yfinanceData?.enterpriseValue || 0;
    const currentMCap = forecast.yfinanceData?.marketCap || 0;
    let netDebt = 0;
    if (currentEV > 0 && currentMCap > 0) {
      netDebt = currentEV - currentMCap;
    }

    // ------------------------------------------
    // METHOD LOGIC BIFURCATION (Updated)
    // ------------------------------------------

    if (activeMethod === 'dcf') {
      // ... (Existing DCF Logic check Step 1325) ... 
      // Logic should be identical to Step 1325 but ensuring fields are mapped correctly.
      // Copying and refining for safety.

      let sumPvFcf = 0;
      let detailsFcf = "";

      projectionsArray.forEach((proj, idx) => {
        const period = idx + 1;
        const fcfVal = proj.fcf || 0;
        const discountFactor = Math.pow(1 + (discountRate / 100), period);
        const pv = fcfVal / discountFactor;
        sumPvFcf += pv;
        if (idx < 3 || idx === projectionsArray.length - 1) {
          detailsFcf += `   • ${proj.year}: $${fcfVal.toFixed(0)}M / (1.${discountRate})^${period} = $${pv.toFixed(0)}M\n`;
        }
      });

      const terminalFcf = projectionsArray[projectionsArray.length - 1]?.fcf || 0;
      let rawG = dcf.terminalGrowthRate;
      if (rawG < 1.0 && rawG > 0) rawG = rawG * 100; // Fix 0.02 -> 2.0
      const g = (rawG || 2.0) / 100;

      const r = discountRate / 100;

      let effectiveR = r;
      if (effectiveR <= g) effectiveR = g + 0.02;

      const terminalValue = (terminalFcf * (1 + g)) / (effectiveR - g);
      const pvTerminalValue = terminalValue / Math.pow(1 + r, yearsToTerminal);
      const enterpriseValue = sumPvFcf + pvTerminalValue;
      impliedEnterpriseValue = enterpriseValue; // Assign to outer scope
      const equityValue = enterpriseValue - netDebt;

      const sharesOutstanding = forecast.yfinanceData?.shares_outstanding || 1;
      presentFairValue = (sharesOutstanding > 0) ? (equityValue * 1000000) / sharesOutstanding : 0;

      valuationDetails = `
      Valuation Method: Discounted Cash Flow (Perpetuity)
      --------------------------------------------------
      1. Sum of PV of Free Cash Flow:
         • Discount Rate (WACC): ${discountRate}%
${detailsFcf}         ➤ Sum PV FCF: $${Math.round(sumPvFcf).toLocaleString()}M
      
      2. Terminal Value (Perpetuity):
         • Terminal Growth Rate (g): ${(g * 100).toFixed(1)}%
         • Formula: FCF * (1+g) / (WACC - g)
         • PV of Terminal Value: $${Math.round(pvTerminalValue).toLocaleString()}M
      
      3. Fair Value Derivation:
         • Implied Enterprise Value: $${Math.round(enterpriseValue).toLocaleString()}M
         • Less: Net Debt ($${Math.round(netDebt).toLocaleString()}M)
         • Implied Equity Value: $${Math.round(equityValue).toLocaleString()}M
         
      ➤ PRESENT FAIR VALUE: $${presentFairValue.toFixed(2)} / share
        `;

    } else {
      // --- EXIT MULTIPLE (Undiscounted Target) ---
      // 1. Determine Terminal Metric
      let terminalMetricVal = 0;
      let terminalMetricName = "Net Income";
      const termProj = projectionsArray[projectionsArray.length - 1];

      // Normalize Multiple Type
      const isPE = multipleType.includes('P/E') || multipleType.includes('PE');
      const isPS = multipleType.includes('Price/Sales') || multipleType.includes('P/S') || multipleType.includes('PS');
      const isEV = !isPE && !isPS; // EV/EBITDA, EV/FCF

      if (termProj) {
        if (isPE) {
          terminalMetricVal = termProj.eps || 0;
          terminalMetricName = "EPS";
        } else if (isPS) {
          terminalMetricVal = termProj.revenue || 0; // $M
          terminalMetricName = "Revenue";
        } else {
          // Default to EV-based
          if (multipleType.includes('EBITDA')) {
            terminalMetricVal = termProj.ebitda || 0;
            terminalMetricName = "EBITDA";
          } else if (multipleType.includes('FCF')) {
            terminalMetricVal = termProj.fcf || 0;
            terminalMetricName = "FCF";
          } else {
            // Fallback
            terminalMetricVal = termProj.ebitda || 0;
            terminalMetricName = "EBITDA";
          }
        }
      }

      const sharesOutstanding = forecast.yfinanceData?.shares_outstanding || 1;
      let futureSharePrice = 0;
      let futureEquityValue = 0;
      let futureEV = 0; // Declare in outer scope

      if (isPE) {
        futureSharePrice = terminalMetricVal * multipleUsed;
        const impliedMCap = (sharesOutstanding * futureSharePrice) / 1000000; // $M
        futureEV = impliedMCap + netDebt; // Derive EV from Equity
        impliedEnterpriseValue = futureEV;
      } else if (isPS) {
        // Price/Sales operates on Market Cap directly (Revenue * Multiple = MCap)
        // MCap = Revenue * Multiple
        const impliedMCap = terminalMetricVal * multipleUsed; // $M
        if (sharesOutstanding > 0) {
          futureSharePrice = (impliedMCap * 1000000) / sharesOutstanding;
        }
        futureEV = impliedMCap + netDebt; // Derive EV from Equity
        impliedEnterpriseValue = futureEV;
      } else {
        // EV Based (EV/EBITDA, EV/FCF)
        futureEV = terminalMetricVal * multipleUsed; // This IS Enterprise Value
        impliedEnterpriseValue = futureEV; // Assign specific EV
        futureEquityValue = futureEV - netDebt;
        if (sharesOutstanding > 0) {
          futureSharePrice = (futureEquityValue * 1000000) / sharesOutstanding;
        }
      }

      presentFairValue = futureSharePrice;

      // Calculate PV of Target (Today's Fair Price based on Discounted Future Value)
      // Formula: Future / (1+r)^n
      const pvOfTarget = futureSharePrice / Math.pow(1 + (discountRate / 100), yearsToTerminal);

      // Build Logic Text
      // Build Logic Text
      // Re-derive flags for text block
      const isPEText = multipleType.includes('P/E') || multipleType.includes('PE');
      const isPSText = multipleType.includes('Price/Sales') || multipleType.includes('P/S') || multipleType.includes('PS');

      if (isPEText) {
        valuationDetails = `
      Valuation Method: Exit Multiple (P/E)
      --------------------------------------------------
      1. Terminal Year (${terminalYear?.year}) Projections:
         • EPS: $${(terminalMetricVal).toFixed(2)}
      
      2. Future Value (2030 Target Price):
         • Assumed P/E Multiple: ${multipleUsed.toFixed(1)}x
         • Implied 2030 Price: $${futureSharePrice.toFixed(2)} / share
      
      ➤ TARGET PRICE (Undiscounted): $${presentFairValue.toFixed(2)} / share
      
      (Reference: Discounted PV to Today @ ${discountRate}% = $${pvOfTarget.toFixed(2)})
    `;
      } else if (isPSText) {
        valuationDetails = `
      Valuation Method: Exit Multiple (Price/Sales)
      --------------------------------------------------
      1. Terminal Year (${terminalYear?.year}) Projections:
         • Revenue: $${(terminalMetricVal).toLocaleString()}M
      
      2. Future Value (2030 Target Price):
         • Assumed P/S Multiple: ${multipleUsed.toFixed(1)}x
         • Implied Market Cap: $${(terminalMetricVal * multipleUsed).toLocaleString()}M
         • Implied 2030 Price: $${futureSharePrice.toFixed(2)} / share
      
      ➤ TARGET PRICE (Undiscounted): $${presentFairValue.toFixed(2)} / share
      
      (Reference: Discounted PV to Today @ ${discountRate}% = $${pvOfTarget.toFixed(2)})
        `;
      } else {
        valuationDetails = `
      Valuation Method: Exit Multiple (${multipleType})
      --------------------------------------------------
      1. Terminal Year (${terminalYear?.year}) Projections:
         • ${terminalMetricName}: $${(terminalMetricVal).toLocaleString()}M
      
      2. Future Value (2030 Target Price):
         • Assumed Multiple: ${multipleUsed.toFixed(1)}x (${multipleType})
         • Implied Enterprise Value: $${(futureEV).toLocaleString()}M
         • Less: Net Debt ($${Math.round(netDebt).toLocaleString()}M) [Calc: CurrEV - CurrMCap]
         • Implied Equity Value: $${Math.round(futureEquityValue).toLocaleString()}M
         • Implied 2030 Price: $${futureSharePrice.toFixed(2)} / share
      
      ➤ TARGET PRICE (Undiscounted): $${presentFairValue.toFixed(2)} / share
      
      (Reference: Discounted PV to Today @ ${discountRate}% = $${pvOfTarget.toFixed(2)})
    `;
      }
    }

    // 4. Calculate Upside
    // CRITICAL FIX: Always use YFinance (Real) price first.
    const currentPrice = forecast.yfinanceData?.currentPrice || forecast.dcf?.currentPrice || 1;
    const calculatedUpside = ((presentFairValue - currentPrice) / currentPrice) * 100;

    // 5. Update DCF Object with Calculated Values
    // We prioritize our calculated values over the LLM's potentially inconsistent ones
    dcf.fairValuePerShare = Number(presentFairValue.toFixed(2));
    dcf.upsideDownside = Number(calculatedUpside.toFixed(2));

    const exitMultipleCalculation = {
      type: multipleType,
      multiple: multipleUsed,
      calculationDetails: valuationDetails,
      terminalGrowthRate: dcf.terminalGrowthRate
    };

    const valuationText = valuationDetails;

    // Calculate IMPLIED RETURN CAGR (based on Upside to 2030)
    // Formula: (1 + Upside%)^(1/Years) - 1
    // Years = 2030 - CurrentYear (approx 5)
    // If Upside is 0.2%, CAGR is ~0.04%. If Upside is 100%, CAGR is ~15%.
    let cagr = 0;
    const forecastYears = projectionsArray.length - 1 || 5;
    if (dcf.upsideDownside !== 0) {
      const totalReturn = 1 + (dcf.upsideDownside / 100);
      // Handle negative return safely
      if (totalReturn > 0) {
        cagr = (Math.pow(totalReturn, 1 / forecastYears) - 1) * 100;
      } else {
        cagr = -99; // Distressed
      }
    }

    // Capture Revenue CAGR separately if needed for text
    const revCagr = projectionsArray[0]?.revenue ?
      ((Math.pow((projectionsArray[projectionsArray.length - 1]?.revenue || 0) / projectionsArray[0].revenue, 1 / forecastYears) - 1) * 100) : 0;

    // Prepare Sonar/Analysis Text (Enhanced)
    let sonarSummary = forecast.sonarData ?
      (forecast.sonarData.guidance_summary || forecast.sonarData.summary || forecast.sonarData.full_response || '') : "";

    // Remove citations [1], [2] etc.
    sonarSummary = sonarSummary.replace(/\[\d+\]/g, '').replace(/\(Source:.*?\)/gi, '');

    // Add developments if available
    let sonarDevs = forecast.sonarData?.recent_developments ? `\n\nRecent Developments:\n${forecast.sonarData.recent_developments}` : "";
    sonarDevs = sonarDevs.replace(/\[\d+\]/g, '').replace(/\(Source:.*?\)/gi, '');

    // Append Revenue CAGR
    const richAnalysisText = `Market Analysis:\n${sonarSummary}${sonarDevs}\n\n[Analyst Note] Nominal Revenue CAGR (2025-2030): ${revCagr.toFixed(1)}%`
      .replace(/\(High Confidence\)/gi, '')
      .replace(/\(Medium Confidence\)/gi, '')
      .replace(/\(Low Confidence\)/gi, '')
      .replace(/Conclusion \(Confidence:.*?\)/gi, 'Conclusion');

    // 3. Construct the legacy response object
    // Filter out historical financial years with invalid/zero revenue (prevents empty chart columns)
    const validHistoricalData = (forecast.historicalData || []).filter(h => h.revenue && Number(h.revenue) > 0);

    const legacyResponse = {
      projections: projectionsArray,
      historicalFinancials: validHistoricalData,

      financials: forecast.yfinanceData || {},
      marketData: {
        current_price: forecast.dcf?.currentPrice,
        market_cap: forecast.yfinanceData?.marketCap,
        pe_ratio: forecast.yfinanceData?.peRatio,
        enterprise_value: forecast.yfinanceData?.enterpriseValue
      },

      // Explicitly map sourceMetrics for frontend "Calculation Breakdown"
      sourceMetrics: {
        enterpriseValue: forecast.yfinanceData?.enterpriseValue || 0,
        ebitda: forecast.yfinanceData?.ebitda || 0,
        fcf: forecast.yfinanceData?.freeCashFlow || 0
      },
      companyName: forecast.companyName,

      // Validation/DCF root fields
      fairValue: dcf.fairValuePerShare,
      currentSharePrice: currentPrice, // Use refined price
      upside: dcf.upsideDownside,
      cagr: cagr,
      method: activeMethod, // RETURN THE ACTIVE METHOD CORRECTLY

      // DCF Specifics exposed to root for Summary Card
      discountRate: discountRate,    // for method=dcf card
      terminalGrowth: (dcf.terminalGrowthRate && dcf.terminalGrowthRate < 1 ? (dcf.terminalGrowthRate * 100) : (dcf.terminalGrowthRate || 2.0)).toFixed(1),

      fairEnterpriseValue: impliedEnterpriseValue,
      currentEnterpriseValue: forecast.yfinanceData?.enterpriseValue || 0,

      // Root fields required by DCFValuation.js Summary Card
      exitMultipleType: multipleType,
      exitMultipleValue: Number(multipleUsed).toFixed(1),

      // Critical for "Top Row" summary cards
      exitMultipleCalculation: {
        type: multipleType,
        multiple: Number(multipleUsed), // Ensure strictly number
        calculationDetails: valuationDetails, // passed here
        terminalGrowthRate: dcf.terminalGrowthRate
      },

      // "Sections" for UI text display
      sections: {
        assumptions: assumptionsText,
        // If DCF, assign to fairValueCalculation so it displays
        fairValueCalculation: activeMethod === 'dcf' ? valuationDetails : "",
        exitMultipleValuation: valuationText,
        // Map Sonar data to where frontend expects general analysis
        financialAnalysis: richAnalysisText
      },

      // Legacy field often used for "Latest Developments" tab
      latestDevelopments: richAnalysisText,
      rawFinancialAnalysis: richAnalysisText,

      // Metadata/Sonar
      sonar: forecast.dataQuality?.sonarData,
      valuationHistory: forecast.valuationHistory || [], // Pass the historical valuation data

      // New Metadata (for debugging/badges if UI updated to support it)
      meta: metadata,
      validation: validation,

      // SATISFY LEGACY FRONTEND VALIDATION
      // The frontend requires 'rawForecast' to be present, even if projections are already parsed.
      rawForecast: "Forecast generated via Gemini Service (Structured Data)"
    };
    // I will QUICKLY UPDATE `gemini-forecast.js` to pass `historicalData` through.

    return NextResponse.json(legacyResponse);

  } catch (error) {
    console.error('[LegacyAdapter] Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

// GET Handler - minimal implementation or alias to POST logic with defaults
export async function GET(request) {
  return POST(request);
}
