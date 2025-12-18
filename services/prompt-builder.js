export function buildCompressedPrompt(ticker, companyName, data, userFeedback = '') {
  const { yfinanceData, sonarData, historicalData, dataQuality } = data;

  // Build compact historical summary
  const historicalSummary = buildHistoricalSummary(historicalData);

  // Extract only key insights from Sonar
  const keyInsights = extractKeyInsights(sonarData);

  const currentYear = new Date().getFullYear();
  const fyLabel = yfinanceData.fiscalInfo?.current_fiscal_year ? `FY${yfinanceData.fiscalInfo.current_fiscal_year}` : `FY${currentYear}`;

  // Build the prompt
  return `You are a financial analyst forecasting ${companyName} (${ticker}) through 2029/2030.

# DATA QUALITY: ${dataQuality.score}/100
${dataQuality.issues.length > 0 ? `⚠️ Issues: ${dataQuality.issues.join('; ')}` : ''}

# CURRENT ACTUALS (${fyLabel} / TTM)
Rev: $${Number(yfinanceData.revenue || 0).toFixed(0)}M | GM: ${Number(yfinanceData.grossMargin || 0).toFixed(1)}% | EBITDA: $${Number(yfinanceData.ebitda || 0).toFixed(0)}M
NI: $${Number(yfinanceData.netIncome || 0).toFixed(0)}M | EPS: $${Number(yfinanceData.eps || 0).toFixed(2)}
Price: $${yfinanceData.currentPrice} | MCap: $${Number(yfinanceData.marketCap || 0).toFixed(0)}M | P/E: ${Number(yfinanceData.peRatio || 0).toFixed(1)}

# HISTORICAL (${historicalData.length}Y)
${historicalSummary}

# LATEST INSIGHTS
${keyInsights}

# USER ASSUMPTIONS (OVERRIDES)
${userFeedback ? `### STRICT USER OVERRIDES
The user has provided SPECIFIC instructions that you MUST follow above all else:
"${userFeedback}"

CRITICAL:
1. If the user asks for a specific "Exit Multiple" (e.g. "Use Price/Sales", "Use EV/Revenue"), you MUST set "exitMultipleType" to exactly that logic (e.g. "Price/Sales") and choose a reasonable value for that metric.
2. If the user asks for specific growth rates or margins, you MUST reflect them in the "projections" object.
3. IGNORE your default preferences if they conflict with these User Overrides.` : 'None provided.'}

---

# YOUR TASK

## Step 1: Identify Core Drivers
1. Growth driver (e.g., unit growth, pricing, market share)
2. Profitability driver (e.g., scale, efficiency, mix)
3. Risk factor (e.g., competition, regulation)

## Step 2: Build Projections (2025-2030)
- Project Revenue Growth, EBITDA Margin, Net Income.
- **CRITICAL**: Calculate Free Cash Flow (FCF) Margin for every year. FCF = Operating Cash Flow - CapEx.
- **CRITICAL**: Revenue growth must generally decelerate (law of large numbers). 
- **CRITICAL**: Margins shouldn't expand >300bps without strong reason.
- Terminal growth rate <= 3%.
- End Year MUST be 2030.

## Step 3: DCF Valuation
- Method: Exit Multiple or Perpetuity Growth.
- Discount Rate: 8-12%.
- Check: Terminal value < 75% of EV.
- Base valuation on 2030 numbers.
- **Select appropriate Multiple Type** (PE, EV/EBITDA, etc.) based on company stage/sector.

- **Growth Trajectory**: Do NOT default to aggressive deceleration. If the company has strong tailwinds (AI, Cloud, GLP-1, etc.), maintain higher growth.
- **Specificity**: Avoid generic phrases like "Law of Large Numbers" or "Macro headwinds" unless specifically relevant. Quote specific drivers (e.g., "Azure growth", "iPhone cycle", "ServiceNow Federal contract expansion").
- **Multiple**: Choose a multiple that reflects the *future* quality of the business (Margins, Moat), not just the current valuation.

---

# OUTPUT FORMAT (JSON ONLY - NO MARKDOWN)

{
  "analysis_quality": "${dataQuality.score >= 70 ? 'reliable' : 'limited'}",
  "key_drivers": {
    "growth": {"factor": "..."},
    "profitability": {"factor": "..."},
    "risk": {"factor": "..."}
  },
  "projections": {
    "${currentYear}": {
      "revenue": ${yfinanceData.revenue},
      "revenueGrowth": null, 
      "grossMargin": ${yfinanceData.grossMargin || null},
      "ebitdaMargin": ${calculateMargin(yfinanceData.ebitda, yfinanceData.revenue)},
      "fcfMargin": ${calculateMargin(yfinanceData.freeCashFlow, yfinanceData.revenue)},
      "netIncome": ${yfinanceData.netIncome},
      "eps": ${yfinanceData.eps || null}
    },
    "${currentYear + 1}": {
      "revenue": 0,
      "revenueGrowth": 0,
      "grossMargin": 0,
      "ebitdaMargin": 0,
      "fcfMargin": 0,
      "netIncome": 0,
      "eps": 0,
      "assumption": "..."
    },
    "${currentYear + 2}": {...},
    "${currentYear + 3}": {...},
    "${currentYear + 4}": {...},
    "${currentYear + 5}": {...}
  },
  "dcf": {
    "discountRate": 0,
    "terminalGrowthRate": 0,
    "terminalValuePercent": 0,
    "fairValueEnterprise": 0,
    "fairValueEquity": 0,
    "fairValuePerShare": 0,
    "currentPrice": ${yfinanceData.currentPrice},
    "upsideDownside": 0,
    "impliedForwardPE": 0,
    "exitMultipleType": "${(() => {
      if (!userFeedback) return "PE";
      if (userFeedback.includes("Price/Sales") || userFeedback.includes("P/S")) return "Price/Sales";
      if (userFeedback.includes("EV/EBITDA")) return "EV/EBITDA";
      if (userFeedback.includes("EV/FCF")) return "EV/FCF";
      return "PE";
    })()}", 
    // Example: If user asked for Price/Sales, this field MUST be "Price/Sales"
    "exitMultipleValue": 0 // The actual multiple used (e.g. 20.5)
  },
  "assumptions": [
    {
      "category": "Revenue Growth",
      "assumption": "...",
      "driver": "...",
      "risk": "..."
    }
  ],
  "validation": {
    "revenueGrowthDecelerates": true/false,
    "marginsReasonable": true/false,
    "terminalValueCheck": true/false,
    "multiplesReasonable": true/false,
    "warnings": ["..."]
  },
  }
}

**IMPORTANT**: 
- Valid JSON only.
- No markdown.
- All numbers as numbers.
`;
}

function buildHistoricalSummary(historicalData) {
  if (!historicalData || historicalData.length === 0) {
    return 'No historical data available';
  }

  const revenues = historicalData.map(d => d.revenue);
  const cagr = calculateCAGR(revenues);
  const avgMargin = historicalData.reduce((sum, d) => sum + (d.ebitdaMargin || 0), 0) / historicalData.length;

  // Create a minimal table
  const rows = historicalData.slice(-5).map(h =>
    `FY${h.year}: Rev $${(h.revenue / 1e6).toFixed(0)}M (${h.revenueGrowth?.toFixed(1)}%) | EBITDA ${h.ebitdaMargin?.toFixed(1)}%`
  ).join('\n');

  return `Rev CAGR (${historicalData.length}y): ${cagr.toFixed(1)}% | Avg EBITDA Margin: ${avgMargin.toFixed(1)}%\n${rows}`;
}

function extractKeyInsights(sonarData) {
  if (!sonarData || (!sonarData.summary && !sonarData.full_response)) {
    return 'No recent insights available - use historical trends only';
  }

  // Prefer the structured fields if available, populate with more depth
  if (sonarData.guidance_summary || sonarData.mgmt_summary) {
    // Increase detail limit
    const developments = sonarData.recent_developments ? `\n- Developments: ${sonarData.recent_developments}` : '';
    return `- Guidance: ${sonarData.guidance_summary}\n- Mgmt: ${sonarData.mgmt_summary}\n- Estimates: ${sonarData.consensus_revenue_next_year ? `Rev ${sonarData.consensus_revenue_next_year}, EPS ${sonarData.consensus_eps_next_year}` : 'N/A'}${developments}`;
  }

  // Fallback to full response but allow more length
  return (sonarData.full_response || sonarData.summary || '').slice(0, 1500); // Increased from 500
}


function calculateMargin(value, revenue) {
  if (!value || !revenue || revenue === 0) return 0;
  return Number(((value / revenue) * 100).toFixed(1));
}

function calculateCAGR(values) {
  if (values.length < 2) return 0;
  const start = values[0]; // First available year
  const end = values[values.length - 1]; // Last available year
  const years = values.length - 1;
  if (start === 0) return 0;
  return ((Math.pow(end / start, 1 / years) - 1) * 100);
}
