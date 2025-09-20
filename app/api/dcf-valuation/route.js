import { NextResponse } from 'next/server';
import { headers as nextHeaders } from 'next/headers';
import yahooFinance from 'yahoo-finance2';

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

// export const runtime = 'edge';

// Function to detect if a stock is a bank/financial institution
function detectBankStock(incomeStatement, summary) {
  // Check for bank-specific income statement items
  const hasInterestIncome = incomeStatement?.interestIncome && Number(incomeStatement.interestIncome) > 0;
  const hasInterestExpense = incomeStatement?.interestExpense && Number(incomeStatement.interestExpense) > 0;
  const hasNetInterestIncome = incomeStatement?.netInterestIncome && Number(incomeStatement.netInterestIncome) > 0;
  
  // Check for bank-specific business description keywords
  const businessSummary = summary?.summaryProfile?.longBusinessSummary || '';
  const bankKeywords = ['bank', 'banking', 'financial services', 'credit', 'lending', 'deposits', 'loans', 'mortgage', 'investment banking', 'jpmorgan', 'chase'];
  const hasBankKeywords = bankKeywords.some(keyword => 
    businessSummary.toLowerCase().includes(keyword)
  );
  
  // Check industry classification
  const industry = summary?.summaryProfile?.industry || '';
  const sector = summary?.summaryProfile?.sector || '';
  const isFinancialSector = sector.toLowerCase().includes('financial') || 
                           industry.toLowerCase().includes('bank') ||
                           industry.toLowerCase().includes('financial') ||
                           industry.toLowerCase().includes('banking');
  
  // Additional check: if gross profit is 0 or very low relative to revenue, likely a bank
  const revenue = Number(incomeStatement?.totalRevenue) || 0;
  const grossProfit = Number(incomeStatement?.grossProfit) || 0;
  const hasLowGrossProfit = revenue > 0 && grossProfit < (revenue * 0.1); // Less than 10% gross margin
  
  const isBank = hasInterestIncome || hasInterestExpense || hasNetInterestIncome || hasBankKeywords || isFinancialSector || hasLowGrossProfit;
  
  console.log('Bank detection details:', {
    hasInterestIncome,
    hasInterestExpense,
    hasNetInterestIncome,
    hasBankKeywords,
    isFinancialSector,
    hasLowGrossProfit,
    businessSummary: businessSummary.substring(0, 100),
    industry,
    sector,
    isBank
  });
  
  return isBank;
}

// Helper functions for extracting forecast sections
function extractForecastTable(text) {
  const tableMatch = text.match(/(Year \| Revenue.*?)(?=Fair Value Calculation:|Exit Multiple Valuation:|$)/s);
  return tableMatch ? tableMatch[1].trim() : '';
}

function extractFairValueCalculation(text) {
  const calcMatch = text.match(/(Fair Value Calculation:.*?)(?=Assumptions and Justifications:|$)/s);
  return calcMatch ? calcMatch[1].trim() : '';
}

function extractExitMultipleValuation(text) {
  const exitMatch = text.match(/(Exit Multiple Valuation:.*?)(?=Assumptions and Justifications:|$)/s);
  return exitMatch ? exitMatch[1].trim() : '';
}

function extractAssumptions(text) {
  const assumptionsMatch = text.match(/(Assumptions and Justifications:.*?)(?=$)/s);
  return assumptionsMatch ? assumptionsMatch[1].trim() : '';
}

// New helper function to parse forecast table into structured data
function parseForecastTable(text) {
  const tableMatch = text.match(/(Year \| Revenue.*?)(?=Fair Value Calculation:|Exit Multiple Valuation:|$)/s);
  if (!tableMatch) return [];
  
  const tableText = tableMatch[1];
  const lines = tableText.split('\n').filter(line => line.trim() && !line.includes('----'));
  
  return lines.map(line => {
    const parts = line.split('|').map(part => part.trim());
    if (parts.length < 7) return null;
    
    return {
      year: parts[0],
      revenue: parseFloat(parts[1].replace(/[^\d.-]/g, '')) || 0,
      revenueGrowth: parseFloat(parts[2].replace(/[^\d.-]/g, '')) || 0,
      grossMargin: parseFloat(parts[3].replace(/[^\d.-]/g, '')) || 0,
      ebitdaMargin: parseFloat(parts[4].replace(/[^\d.-]/g, '')) || 0,
      fcfMargin: parseFloat(parts[5].replace(/[^\d.-]/g, '')) || 0,
      netIncome: parseFloat(parts[6].replace(/[^\d.-]/g, '')) || 0,
      eps: parts[7] ? parseFloat(parts[7].replace(/[^\d.-]/g, '')) || 0 : null
    };
  }).filter(Boolean);
}

// New helper function to extract clean sections
function extractSections(text, method) {
  return {
    forecastTable: extractForecastTable(text),
    fairValueCalculation: method === 'dcf' ? extractFairValueCalculation(text) : '',
    exitMultipleValuation: method === 'exit-multiple' ? extractExitMultipleValuation(text) : '',
    assumptions: extractAssumptions(text)
  };
}

// Function to fetch financial data using yahoo-finance2 (replacing Python yfinance)
async function fetchFinancialsWithYfinance(ticker) {
  try {
    console.log('Fetching yfinance data for:', ticker);
    
    // 1) Try Python script first for robust statements (historical margins)
    try {
    const { spawn } = await import('child_process');
    
      // Use external API in production if configured
      if (process.env.VERCEL === '1' || process.env.NEXT_RUNTIME === 'edge' || process.env.NODE_ENV === 'production') {
            const externalPyApi = process.env.PY_YF_URL;
        if (externalPyApi) {
            const url = `${externalPyApi}?ticker=${encodeURIComponent(ticker)}`;
            const res = await fetch(url, { method: 'GET' });
          if (res.ok) {
            const json = await res.json();
            if (json && (Array.isArray(json.historical_financials) ? json.historical_financials.length : 0) > 0) {
              console.log('Using Python yfinance API (external) result');
              return json;
            }
          } else {
            console.warn('External Python yfinance API failed:', res.status);
          }
        }
      }

      // Local Python script execution (dev/local)
      const pythonCmd = `${process.cwd()}/venv/bin/python3`;
      const scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;

      const isDarwin = process.platform === 'darwin';
      const isNodeRosetta = process.arch === 'x64';
      const useArchWrapper = isDarwin && isNodeRosetta;
      const cmd = useArchWrapper ? '/usr/bin/arch' : pythonCmd;
      const args = useArchWrapper ? ['-arm64', pythonCmd, scriptPath, ticker] : [scriptPath, ticker];

      const pyResult = await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
          if (code !== 0) {
            console.warn('Python script exited with non-zero code:', code, stderr);
            return resolve(null);
          }
          try {
            const json = JSON.parse(stdout);
            resolve(json);
          } catch (e) {
            console.warn('Failed to parse Python output:', e);
            resolve(null);
          }
        });
        child.on('error', (err) => {
          console.warn('Failed to start Python process:', err);
          resolve(null);
        });
      });

      if (pyResult && (Array.isArray(pyResult.historical_financials) ? pyResult.historical_financials.length : 0) > 0) {
        console.log('Using local Python yfinance result');
        return pyResult;
      }
    } catch (pyErr) {
      console.warn('Python yfinance fetch not available, falling back to yahoo-finance2:', pyErr?.message);
    }

    // 2) Fallback: yahoo-finance2
    console.log('Fetching yfinance data (node fallback) for:', ticker);

    const modules = [
      'price',
      'summaryDetail',
      'summaryProfile',
      'defaultKeyStatistics',
      'financialData',
      'incomeStatementHistory',
      'cashflowStatementHistory',
      'balanceSheetHistory',
    ];

    const summary = await yahooFinance.quoteSummary(ticker, { modules });

    const price = summary?.price || {};
    const summaryDetail = summary?.summaryDetail || {};
    const summaryProfile = summary?.summaryProfile || {};
    const keyStats = summary?.defaultKeyStatistics || {};
    const financialData = summary?.financialData || {};
    const incomeHistory = summary?.incomeStatementHistory?.incomeStatementHistory || [];
    const cashflowHistory = summary?.cashflowStatementHistory?.cashflowStatements || [];
    const balanceHistory = summary?.balanceSheetHistory?.balanceSheetStatements || [];

    const latestIncome = incomeHistory[0] || {};
    const latestCashflow = cashflowHistory[0] || {};

    const toNumber = (v) => {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object') {
        if (typeof v.raw === 'number') return v.raw;
        if (typeof v.longFmt === 'string') return Number(v.longFmt.replace(/[^\d.-]/g, '')) || 0;
        if (typeof v.fmt === 'string') return Number(v.fmt.replace(/[^\d.-]/g, '')) || 0;
      }
      return Number(v) || 0;
    };

    const totalRevenue = toNumber(latestIncome.totalRevenue);
    const netIncome = toNumber(latestIncome.netIncome);
    
    // Detect if this is a bank/financial institution
    const isBank = detectBankStock(latestIncome, summary);
    console.log(`Bank detection for ${ticker}:`, {
      isBank,
      hasInterestIncome: !!latestIncome.interestIncome,
      hasInterestExpense: !!latestIncome.interestExpense,
      industry: summary?.summaryProfile?.industry,
      sector: summary?.summaryProfile?.sector
    });
    
    let grossProfit, ebitda;
    
    if (isBank) {
      // For banks, use different metrics
      // Net Interest Income = Interest Income - Interest Expense
      const interestIncome = toNumber(latestIncome.interestIncome);
      const interestExpense = toNumber(latestIncome.interestExpense);
      grossProfit = interestIncome - interestExpense; // Net Interest Income
      
      // For banks, use Pre-Provision Operating Revenue (PPOR) instead of EBITDA
      // PPOR = Net Interest Income + Non-Interest Income - Non-Interest Expense
      const nonInterestIncome = toNumber(latestIncome.totalOtherIncomeExpenseNet);
      const nonInterestExpense = toNumber(latestIncome.operatingExpense) - interestExpense;
      ebitda = grossProfit + nonInterestIncome - nonInterestExpense;
    } else {
      // Regular company logic
      grossProfit = toNumber(latestIncome.grossProfit);
      if (!grossProfit && totalRevenue) {
        const costOfRevenue = toNumber(latestIncome.costOfRevenue);
        if (costOfRevenue) grossProfit = totalRevenue - costOfRevenue;
      }
      
      // EBITDA might be available under financialData
      ebitda = toNumber(financialData.ebitda);
      if (!ebitda) {
        const latestCFDep = toNumber(
          latestCashflow.depreciation ?? latestCashflow.depreciationAndAmortization
        );
        const latestOperatingIncome = toNumber(latestIncome.operatingIncome ?? latestIncome.ebit);
        ebitda = latestOperatingIncome + latestCFDep;
      }
    }

    const operatingCF = toNumber(
      latestCashflow.totalCashFromOperatingActivities ?? latestCashflow.operatingCashflow
    );
    const capex = toNumber(latestCashflow.capitalExpenditures);
    const fcf = operatingCF + capex; // capex usually negative

    const currentPrice = toNumber(price.regularMarketPrice ?? financialData.currentPrice);
    const marketCap = toNumber(price.marketCap);
    const enterpriseValue = toNumber(
      (summaryDetail && summaryDetail.enterpriseValue) || (keyStats && keyStats.enterpriseValue)
    );
    const peRatio = toNumber(
      (summaryDetail && summaryDetail.trailingPE) || (keyStats && keyStats.trailingPE)
    );

    const sharesOutstandingRaw = toNumber(
      price.sharesOutstanding || keyStats.sharesOutstanding
    );

    let eps = toNumber(latestIncome.dilutedEPS ?? latestIncome.basicEPS);
    if (!eps) {
      const dilutedShares = toNumber(latestIncome.dilutedAverageShares);
      if (dilutedShares > 0) {
        eps = netIncome / dilutedShares;
      } else {
        eps = toNumber(keyStats.trailingEps ?? financialData.epsCurrentYear);
      }
    }

    // Fallback margins from financialData if statement components unavailable
    const fdGross = toNumber(financialData.grossMargins);
    const fdEbitda = toNumber(financialData.ebitdaMargins);
    const fdProfit = toNumber(financialData.profitMargins);
    const fdFreeCashflow = toNumber(financialData.freeCashflow);
    const fdOperatingCashflow = toNumber(financialData.operatingCashflow);

    const grossMarginPct = totalRevenue
      ? (grossProfit / totalRevenue) * 100
      : (fdGross ? (fdGross < 1 ? fdGross * 100 : fdGross) : 0);
    const ebitdaMarginPct = totalRevenue
      ? (ebitda / totalRevenue) * 100
      : (fdEbitda ? (fdEbitda < 1 ? fdEbitda * 100 : fdEbitda) : 0);
    const fcfMarginPct = totalRevenue
      ? (fcf / totalRevenue) * 100
      : (fdFreeCashflow && totalRevenue ? (fdFreeCashflow / totalRevenue) * 100 : 25);

    const companyName = price.longName || price.shortName || ticker;
    let currency = price.currency || 'USD';
    
    // Detect currency based on country if not explicitly provided
    if (!price.currency && summaryProfile?.country) {
      const countryCurrencyMap = {
        'Denmark': 'DKK',
        'Sweden': 'SEK',
        'Norway': 'NOK',
        'Switzerland': 'CHF',
        'United Kingdom': 'GBP',
        'Germany': 'EUR',
        'France': 'EUR',
        'Italy': 'EUR',
        'Spain': 'EUR',
        'Netherlands': 'EUR',
        'Japan': 'JPY',
        'China': 'CNY',
        'India': 'INR',
        'Brazil': 'BRL',
        'Canada': 'CAD',
        'Australia': 'AUD',
        'South Korea': 'KRW',
        'Taiwan': 'TWD',
        'Hong Kong': 'HKD',
        'Singapore': 'SGD'
      };
      currency = countryCurrencyMap[summaryProfile.country] || 'USD';
    }

    // Build historical financials (up to 4 most recent, oldest->newest), values in $M
    let historical_financials = [];
    try {
      // Use income statement history instead of fundamentalsTimeSeries
      const incomeHistory = quote.incomeStatementHistory || {};
      const cashFlowHistory = quote.cashflowStatementHistory || {};

      // Process income statement history
      const incomeYears = Object.keys(incomeHistory).sort((a, b) => {
        const dateA = new Date(incomeHistory[a].endDate);
        const dateB = new Date(incomeHistory[b].endDate);
        return dateA - dateB;
      }).slice(-4); // Get last 4 years

      let prevRevenueM = null;
      for (const yearKey of incomeYears) {
        const yearData = incomeHistory[yearKey];
        const yearNum = new Date(yearData.endDate).getFullYear();
        
        const rev = yearData.totalRevenue || 0;
        const gp = yearData.grossProfit || 0;
        const ebitdaY = yearData.ebitda || 0;
        const ni = yearData.netIncome || 0;
        const ocf = cashFlowHistory[yearKey]?.totalCashFromOperatingActivities || 0;
        const capex = cashFlowHistory[yearKey]?.capitalExpenditures || 0;
        const epsY = yearData.dilutedEPS || 0;

        if (rev && rev > 0) {
          const revM = rev / 1e6;
          const gpM = gp / 1e6;
          const ebitdaM = ebitdaY / 1e6;
          const niM = ni / 1e6;
          const ocfM = ocf / 1e6;
          const capexM = capex / 1e6;
          const fcfM = ocfM - capexM;

          const grossMargin = rev ? (gpM / revM) * 100 : 0;
          const ebitdaMargin = rev ? (ebitdaM / revM) * 100 : 0;
          const netIncomeMargin = rev ? (niM / revM) * 100 : 0;
          const fcfMargin = rev ? (fcfM / revM) * 100 : 0;
          const revenueGrowth = prevRevenueM ? ((revM - prevRevenueM) / prevRevenueM) * 100 : null;
          prevRevenueM = revM;

          historical_financials.push({
            year: `FY${String(yearNum).slice(-2)}`,
            revenue: revM,
            revenueGrowth,
            grossProfit: gpM,
            grossMargin,
            ebitda: ebitdaM,
            ebitdaMargin,
            fcf: fcfM,
            fcfMargin,
            netIncome: niM,
            netIncomeMargin,
            eps: epsY || 0
          });
        }
      }
    } catch (tsErr) {
      console.warn('Income statement history processing failed:', tsErr?.message);
    }

    // Fallback: align income/cashflow statements by nearest date
    if (!historical_financials.length) {
      // Re-detect bank status for fallback processing
      const isBankFallback = detectBankStock(incomeHistory[0], summary);
      const findNearestByDate = (list, targetDate, toleranceDays = 90) => {
        if (!Array.isArray(list) || list.length === 0) return null;
        const t = new Date(targetDate).getTime();
        let best = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const item of list) {
          if (!item?.endDate) continue;
          const d = new Date(item.endDate).getTime();
          const delta = Math.abs(d - t);
          if (delta < bestDelta) {
            best = item;
            bestDelta = delta;
          }
        }
        return best;
      };

      const recent = incomeHistory.slice(0, 4).reverse();
      let prevRevenueM = null;
      for (const inc of recent) {
        const yearNum = new Date(inc.endDate).getUTCFullYear();
        const rev = toNumber(inc.totalRevenue);
        const ni = toNumber(inc.netIncome);
        const cf = findNearestByDate(cashflowHistory, inc.endDate) || {};
        const ocfY = toNumber(cf.totalCashFromOperatingActivities ?? cf.operatingCashflow);
        const capexY = toNumber(cf.capitalExpenditures);
        const fcfY = (ocfY || 0) + (capexY || 0);

        let gp, ebitdaVal, grossMargin, ebitdaMargin;
        
        if (isBankFallback) {
          // For banks, calculate Net Interest Income and PPOR
          const interestIncome = toNumber(inc.interestIncome);
          const interestExpense = toNumber(inc.interestExpense);
          const netInterestIncome = toNumber(inc.netInterestIncome) || (interestIncome - interestExpense);
          
          gp = netInterestIncome; // Net Interest Income
          ebitdaVal = netInterestIncome + (rev - interestIncome); // Simplified PPOR
          
          grossMargin = rev ? (gp / rev) * 100 : 0;
          ebitdaMargin = rev ? (ebitdaVal / rev) * 100 : 0;
        } else {
          // Regular company logic
          gp = toNumber(inc.grossProfit);
          if (!gp && rev) {
            const cor = toNumber(inc.costOfRevenue);
            if (cor) gp = rev - cor;
          }
          
          const depY = toNumber(cf.depreciation ?? cf.depreciationAndAmortization);
          const ebitY = toNumber(inc.ebit ?? inc.operatingIncome);
          ebitdaVal = ebitY + depY;
          
          grossMargin = rev ? (gp / rev) * 100 : 0;
          ebitdaMargin = rev ? (ebitdaVal / rev) * 100 : 0;
        }

        const revM = rev / 1_000_000;
        const gpM = gp / 1_000_000;
        const ebitdaM = ebitdaVal / 1_000_000;
        const niM = ni / 1_000_000;
        const fcfM = fcfY / 1_000_000;
        const netIncomeMargin = rev ? (ni / rev) * 100 : 0;
        const fcfMargin = rev ? (fcfY / rev) * 100 : 0;

        let epsY = toNumber(inc.dilutedEPS ?? inc.basicEPS);
        if (!epsY) {
          const sharesY = toNumber(inc.dilutedAverageShares ?? inc.basicAverageShares);
          if (sharesY > 0) epsY = ni / sharesY;
        }

        const revenueGrowth = prevRevenueM ? ((revM - prevRevenueM) / prevRevenueM) * 100 : null;
        prevRevenueM = revM;

        historical_financials.push({
          year: `FY${String(yearNum).slice(-2)}`,
          revenue: revM,
          revenueGrowth,
          grossProfit: gpM,
          grossMargin,
          ebitda: ebitdaM,
          ebitdaMargin,
          fcf: fcfM,
          fcfMargin,
          netIncome: niM,
          netIncomeMargin,
          eps: epsY || 0
        });
      }
    }

    // TODO: Implement currency conversion
    const exchangeRate = 1.0;
    const needsConversion = false;
    const convertValue = (value) => value; // No conversion for now
    
    const result = {
      fy24_financials: {
        revenue: convertValue(totalRevenue),
        gross_profit: convertValue(grossProfit),
        gross_margin_pct: grossMarginPct, // Percentages don't need conversion
        ebitda: convertValue(ebitda),
        ebitda_margin_pct: ebitdaMarginPct,
        net_income: convertValue(netIncome),
        eps: convertValue(eps),
        shares_outstanding: sharesOutstandingRaw, // Share count doesn't need conversion
        fcf: convertValue(fcf),
        fcf_margin_pct: fcfMarginPct
      },
      market_data: {
        current_price: convertValue(currentPrice),
        market_cap: convertValue(marketCap),
        enterprise_value: convertValue(enterpriseValue),
        pe_ratio: peRatio // Ratios don't need conversion
      },
      company_name: companyName,
      source: 'yahoo-finance2',
      currency_info: {
        original_currency: currency,
        converted_to_usd: needsConversion,
        conversion_rate: exchangeRate,
        exchange_rate_source: needsConversion ? 'yahoo-finance' : 'none'
      },
      historical_financials: historical_financials.map(year => ({
        ...year,
        revenue: convertValue(year.revenue),
        grossProfit: convertValue(year.grossProfit),
        ebitda: convertValue(year.ebitda),
        fcf: convertValue(year.fcf),
        netIncome: convertValue(year.netIncome),
        eps: convertValue(year.eps)
      }))
    };

    console.log('Successfully fetched financial data via yahoo-finance2');
    return result;
  } catch (error) {
    console.error('Error in fetchFinancialsWithYfinance (node):', error);
    throw error;
  }
}

// Function to fetch latest data from Sonar
async function fetchLatestWithSonar(ticker) {
  try {
    console.log('Fetching Sonar data for:', ticker);
    
    // Use OpenRouter API to call Perplexity Sonar
    const sonarMessages = [
      {
        role: "system", 
        content: "Return ONLY JSON. Be concise. Use official IR and SEC sources."
      },
      {
        role: "user", 
        content: `Find the most recently reported quarter for ${ticker} (as filed or disclosed by the company) and provide financials and qualitative insights for that same quarter only. Do NOT assume a specific quarter label (e.g., Q2 2025). Use the last reported quarter from official sources. Return EXACTLY this JSON:

JSON:
\`\`\`json
{
  "as_of_date": "YYYY-MM-DD",
  "latest_quarter": float,
  "latest_quarter_revenue": float,
  "latest_quarter_gross_margin_pct": float,
  "latest_quarter_ebitda_margin_pct": float,
  "latest_quarter_net_income": float,
  "guidance_summary": "string",
  "mgmt_summary": "1-3 sentences on key trends and outlook",
  "recent_developments": "string on major news/events",
  "links": { "ir_url": "string", "sec_url": "string" }
}
\`\`\`

Instructions: Focus ONLY on the latest reported quarterly results, management commentary, guidance, and recent developments. Do NOT infer or project future quarters. Do NOT hardcode a quarter label like Q2 2025—use the company's exact last reported quarter label. Do NOT include annual (FY) figures. Use only company IR and SEC sources.`
      }
    ];
    
    const referer = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001';
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
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: sonarMessages,
        plugins: [{"id": "web", "max_results": 5}],
        temperature: 0.3,
        max_tokens: 1000
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Sonar API error: ${response.status}`);
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
    let sonarData = {};
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        sonarData = JSON.parse(jsonMatch[1]);
      } else {
        // Fallback: try to find any JSON in the text
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          sonarData = JSON.parse(braceMatch[0]);
        }
      }
    } catch (parseError) {
      console.error('Error parsing Sonar JSON response:', parseError);
      // Return a structured fallback
      sonarData = {
        as_of_date: new Date().toISOString().split('T')[0],
        latest_quarter: 'N/A',
        latest_quarter_gross_margin_pct: 0,
        latest_quarter_ebitda_margin_pct: 0,
        latest_quarter_net_income: 0,
        guidance_summary: 'No guidance available',
        mgmt_summary: 'No management commentary available',
        recent_developments: 'No recent developments available',
        links: { ir_url: '', sec_url: '' }
      };
    }
    
    // Create the full_response field for compatibility
    const fullResponse = `Latest quarterly data for ${ticker}:
- Management: ${sonarData.mgmt_summary || 'No commentary available'}
- Guidance: ${sonarData.guidance_summary || 'No guidance available'}
- Recent Developments: ${sonarData.recent_developments || 'None available'}`;
    
    const result = {
      ...sonarData,
      full_response: fullResponse
    };
    
    console.log('Real Sonar data:', result);
    return result;
    
  } catch (error) {
    console.error('Error fetching Sonar data:', error);
    // Return default values if Sonar fails
    return {
      full_response: `No recent data available for ${ticker}`,
      latest_quarter: 'N/A',
      latest_quarter_revenue: 0,
      latest_quarter_gross_margin_pct: 0,
      mgmt_summary: 'No management commentary available',
      guidance_summary: 'No guidance available',
      recent_developments: 'No recent developments available'
    };
  }
}

const generateValuation = async (ticker, method, selectedMultiple = 'auto', feedback = null) => {
  try {
    console.log('Generating valuation for:', { ticker, method, selectedMultiple, feedback });
    
    // Fetch the actual data from yfinance and Sonar
    const yf_data = await fetchFinancialsWithYfinance(ticker);
    const sonar_data = await fetchLatestWithSonar(ticker);
    
    console.log('Fetched data:', { yf_data, sonar_data });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation for the company.

The company you will be analyzing is: ${(yf_data?.company_name) || ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below(which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${yf_data.fy24_financials.revenue.toLocaleString()}M
- Gross Margin: ${yf_data.fy24_financials.gross_margin_pct.toFixed(1)}%
- EBITDA: ${yf_data.fy24_financials.ebitda.toLocaleString()}M
- Net Income: ${yf_data.fy24_financials.net_income.toLocaleString()}M
- EPS: ${yf_data.fy24_financials.eps.toFixed(2)}
- Shares Outstanding: ${yf_data.fy24_financials.shares_outstanding.toLocaleString()}M

2. Investigate current industry trends and company-specific factors that may impact future performance. Find some market data below to help you.
MARKET DATA (from yfinance - most updated):
- Current Price: $${yf_data.market_data.current_price.toFixed(2)}
- Market Cap: ${yf_data.market_data.market_cap.toLocaleString()}M
- Enterprise Value: ${yf_data.market_data.enterprise_value ? yf_data.market_data.enterprise_value.toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${yf_data.market_data.pe_ratio ? yf_data.market_data.pe_ratio.toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonar_data.full_response || 'No Sonar data available'}

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
Company Name: ${(yf_data?.company_name) || ticker}

Financial Forecast 2024-2029:

Year | Revenue ($M) | Revenue Growth (%) | Gross Margin (%) | EBITDA Margin (%) | FCF Margin (%) | Net Income ($M) | EPS
---- | ------------ | ------------------ | ---------------- | ----------------- | -------------- | --------------- | ---
2024 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2025 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2026 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2027 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2028 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]
2029 | [Value]      | [Value]            | [Value]          | [Value]           | [Value]        | [Value]         | [Value]

Fair Value Calculation:
Discount Rate: [Value]%
Terminal Growth Rate: [Value]%
Fair Value: $[Value] million

Current Share Price: $${yf_data.market_data.current_price.toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]
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
- Price/Sales: High-growth firms with negative or erratic earnings`;

      } else {
        multipleTypeInstruction = `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      }
      
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation using exit multiple valuation.

The company you will be analyzing is: ${(yf_data?.company_name) || ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

${multipleTypeInstruction}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below(which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${yf_data.fy24_financials.revenue.toLocaleString()}M
- Gross Margin: ${yf_data.fy24_financials.gross_margin_pct.toFixed(1)}%
- EBITDA: ${yf_data.fy24_financials.ebitda.toLocaleString()}M
- Net Income: ${yf_data.fy24_financials.net_income.toLocaleString()}M
- EPS: ${yf_data.fy24_financials.eps.toFixed(2)}
- Shares Outstanding: ${yf_data.fy24_financials.shares_outstanding.toLocaleString()}M

2. Investigate current industry trends and company-specific factors that may impact future performance. Find some market data below to help you.
MARKET DATA (from yfinance - most updated):
- Current Price: $${yf_data.market_data.current_price.toFixed(2)}
- Market Cap: ${yf_data.market_data.market_cap.toLocaleString()}M
- Enterprise Value: ${yf_data.market_data.enterprise_value ? yf_data.market_data.enterprise_value.toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${yf_data.market_data.pe_ratio ? yf_data.market_data.pe_ratio.toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonar_data.full_response || 'No Sonar data available'}

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
Company Name: ${(yf_data?.company_name) || ticker}

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

Current Share Price: $${yf_data.market_data.current_price.toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]

</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;
    } else {
      throw new Error(`Unsupported valuation method: ${method}`);
    }

    const referer = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001';
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
      body: JSON.stringify({
        model: 'x-ai/grok-code-fast-1',
        messages: [
          {
            role: 'system',
            content: 'You are a skilled financial analyst. You MUST return your response in the EXACT format specified in the user prompt. The response MUST start with <forecast> and end with </forecast>. Do not include any text outside these tags.'
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
      console.error('OpenRouter API error:', error);
      
      if (response.status === 404) {
        throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol.`);
      }
      
      throw new Error(error.error?.message || 'Failed to generate valuation');
    }

    const data = await response.json();
    console.log('OpenRouter API response structure:', {
      choices: data.choices?.length,
      hasMessage: !!data.choices?.[0]?.message,
      messageContent: data.choices?.[0]?.message?.content?.substring(0, 100)
    });

    // Extract the text content from the OpenRouter response
    let valuationText;
    if (data.choices?.[0]?.message?.content) {
      valuationText = data.choices[0].message.content;
    } else {
      console.error('Response structure:', data);
      throw new Error('Invalid response from OpenRouter API: No content found');
    }

    if (!valuationText) {
      console.error('Empty valuation text');
      throw new Error('Invalid response from OpenRouter API: Empty text content');
    }

    console.log('Raw valuation text:', valuationText);
    console.log('Raw valuation text length:', valuationText.length);
    console.log('Raw valuation text preview (first 500 chars):', valuationText.substring(0, 500));
    console.log('Raw valuation text preview (last 500 chars):', valuationText.substring(valuationText.length - 500));

    // Parse the new structured forecast format - handle full OpenRouter response
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
        console.log('Financial analysis extracted successfully, length:', financialAnalysisText.length);
      } else {
        console.log('No financial analysis tags found, trying fallback extraction...');
        // Fallback: look for financial analysis content without tags
        const fallbackMatch = valuationText.match(/(\*\*Financial.*?)(?=<forecast>|$)/s);
        if (fallbackMatch) {
          financialAnalysisText = fallbackMatch[1];
          console.log('Financial analysis extracted via fallback, length:', financialAnalysisText.length);
        } else {
          // Second fallback: look for any content before the forecast section
          const beforeForecastMatch = valuationText.match(/(.*?)(?=<forecast>)/s);
          if (beforeForecastMatch && beforeForecastMatch[1].trim()) {
            financialAnalysisText = beforeForecastMatch[1].trim();
            console.log('Financial analysis extracted from content before forecast, length:', financialAnalysisText.length);
          } else {
            // Third fallback: look for any analysis content in the response
            const anyAnalysisMatch = valuationText.match(/(.*?)(?=Financial Forecast|Year \| Revenue)/s);
            if (anyAnalysisMatch && anyAnalysisMatch[1].trim()) {
              financialAnalysisText = anyAnalysisMatch[1].trim();
              console.log('Financial analysis extracted from general content, length:', financialAnalysisText.length);
            } else {
              console.log('No financial analysis found in response');
            }
          }
        }
      }

      console.log('Forecast text length:', forecastText.length);
      console.log('Financial analysis text length:', financialAnalysisText.length);
      console.log('Financial analysis preview:', financialAnalysisText.substring(0, 200));

      // Validate that we have a proper forecast structure
      const hasForecastTable = forecastText.includes('Year | Revenue') || forecastText.includes('Financial Forecast');
      const hasFairValue = forecastText.includes('Fair Value:');
      const hasCurrentPrice = forecastText.includes('Current Share Price:');
      
      console.log('Forecast validation:', {
        hasForecastTable,
        hasFairValue,
        hasCurrentPrice,
        forecastLength: forecastText.length
      });

      // Only require the forecast table to be present
      // Fair value and current price will be handled by retry logic if missing
      if (!hasForecastTable) {
        console.error('Malformed forecast response - missing forecast table');
        throw new Error('Invalid forecast response from OpenRouter API - missing forecast table');
      }

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
          if (columns.length >= 2) {
            const year = columns[0];
            const revenue = columns[1] ? parseFloat(columns[1].replace(/,/g, '')) : 0;
            const revenueGrowth = columns[2] ? parseFloat(String(columns[2]).replace('%', '')) : 0;
            const grossMargin = columns[3] ? parseFloat(String(columns[3]).replace('%', '')) : 0;
            const ebitdaMargin = columns[4] ? parseFloat(String(columns[4]).replace('%', '')) : 0;
            const fcfMargin = columns[5] ? parseFloat(String(columns[5]).replace('%', '')) : 0;
            const netIncome = columns[6] ? parseFloat(columns[6].replace(/,/g, '')) : 0;
            const eps = columns[7] ? parseFloat(columns[7]) : 0;

            tableData.push({
              year,
              revenue: isNaN(revenue) ? 0 : revenue,
              revenueGrowth: isNaN(revenueGrowth) ? 0 : revenueGrowth,
              grossMargin: isNaN(grossMargin) ? 0 : grossMargin,
              ebitdaMargin: isNaN(ebitdaMargin) ? 0 : ebitdaMargin,
              fcfMargin: isNaN(fcfMargin) ? 0 : fcfMargin,
              netIncome: isNaN(netIncome) ? 0 : netIncome,
              eps: isNaN(eps) ? 0 : eps
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
      const fairValueMatch = forecastText.match(/Fair Value:\s*[€$]([\d,]+(?:\.[\d]+)?)\s*million/i);
      if (fairValueMatch) {
        fairValue = parseFloat(fairValueMatch[1].replace(/,/g, ''));
        console.log('Extracted million fair value:', fairValue);
      } else {
        // For exit-multiple method, also check for per-share format
        if (method === 'exit-multiple') {
          console.log('Looking for per-share fair value in:', forecastText.substring(0, 500));
          const perShareMatch = forecastText.match(/Fair Value:\s*[€$]([\d,]+(?:\.\d+)?)\s*per\s*share/i);
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
      const currentPriceMatch = forecastText.match(/Current Share Price:\s*[€$]([\d,]+(?:\.\d+)?)/i);
      if (currentPriceMatch) {
        currentSharePrice = parseFloat(currentPriceMatch[1].replace(/,/g, ''));
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
          financialAnalysis: financialAnalysisText,
          latestDevelopments: (typeof sonar_data !== 'undefined' && sonar_data?.full_response) ? sonar_data.full_response : ''
        }
      };

      // Enrich with source metrics for correct upside/CAGR and frontend display
      try {
        // Attach yfinance and sonar summaries captured earlier in this scope
        if (typeof yf_data !== 'undefined' && yf_data && yf_data.fy24_financials && yf_data.market_data) {
          result.sourceMetrics = {
            currentPrice: yf_data.market_data.current_price || 0,
            marketCap: yf_data.market_data.market_cap || 0, // USD
            sharesOutstanding: yf_data.fy24_financials.shares_outstanding || 0, // in millions
            // Normalize EV to millions so it matches projection units
            enterpriseValue: (yf_data.market_data.enterprise_value || 0) / 1_000_000
          };
          // Actual 2024 data for historical row
          result.actual2024 = {
            revenue: (yf_data.fy24_financials.revenue || 0) / 1_000_000, // normalize to M
            grossProfit: (yf_data.fy24_financials.gross_profit || 0) / 1_000_000,
            ebitda: (yf_data.fy24_financials.ebitda || 0) / 1_000_000,
            netIncome: (yf_data.fy24_financials.net_income || 0) / 1_000_000,
            eps: yf_data.fy24_financials.eps || 0,
            capex: 0,
            workingCapital: 0,
            fcf: 0
          };
          
          // Add currency information
          if (yf_data.currency_info) {
            result.currencyInfo = yf_data.currency_info;
            console.log('Currency conversion info:', yf_data.currency_info);
          }
          
          // Add historical financials
          if (yf_data.historical_financials) {
            result.historicalFinancials = yf_data.historical_financials;
            result.testHistoricalField = "TEST_DATA";
            console.log('Historical financials:', yf_data.historical_financials);
            console.log('Historical financials count:', yf_data.historical_financials.length);
            console.log('Result object after adding historical financials:', Object.keys(result));
            console.log('TEST: result.historicalFinancials should be:', result.historicalFinancials);
            console.log('TEST: result.testHistoricalField should be:', result.testHistoricalField);
            console.log('TEST: result.historicalFinancials should be:', result.historicalFinancials);
            console.log('TEST: result.testHistoricalField should be:', result.testHistoricalField);
          }
        }
        if (typeof sonar_data !== 'undefined' && sonar_data) {
          result.latestDevelopments = sonar_data.full_response || '';
          result.sonar = sonar_data;
        }

        // Compute projections array from tableData so frontend/exports have structured values
        if (Array.isArray(tableData) && tableData.length > 0) {
          result.projections = tableData.map((row) => {
            const revenueM = row.revenue || 0;
            const netIncome = row.netIncome || 0;
            const fcf = revenueM * (row.fcfMargin || 0) / 100;

            // Override 2024 with yfinance actuals when available
            if (row.year === '2024' && typeof yf_data !== 'undefined' && yf_data && yf_data.fy24_financials) {
              const fy = yf_data.fy24_financials;
              const revM = (fy.revenue || 0) / 1_000_000;
              const gpM = typeof fy.gross_profit === 'number' ? (fy.gross_profit || 0) / 1_000_000 : revM * ((fy.gross_margin_pct || 0) / 100);
              const ebitdaM = (fy.ebitda || 0) / 1_000_000;
              const fcfM = typeof fy.fcf === 'number' ? (fy.fcf || 0) / 1_000_000 : revM * ((fy.fcf_margin_pct || row.fcfMargin || 0) / 100);
              const fcfMarginPct = (fy.fcf_margin_pct != null) ? fy.fcf_margin_pct : (revM > 0 ? (fcfM / revM) * 100 : 0);
              const netIncomeM = (fy.net_income || 0) / 1_000_000;
              const netIncomeMarginPct = revM > 0 ? (netIncomeM / revM) * 100 : 0;
              return {
                year: row.year,
                revenue: revM,
                revenueGrowth: row.revenueGrowth || 0,
                grossProfit: gpM,
                grossMargin: fy.gross_margin_pct || row.grossMargin || 0,
                ebitda: ebitdaM,
                ebitdaMargin: fy.ebitda_margin_pct || row.ebitdaMargin || 0,
                freeCashFlow: fcfM,
                fcf: fcfM,
                fcfMargin: fcfMarginPct,
                netIncome: netIncomeM,
                netIncomeMargin: netIncomeMarginPct,
                eps: fy.eps || row.eps || 0
              };
            }

            return {
              year: row.year,
              revenue: revenueM,
              revenueGrowth: row.revenueGrowth || 0,
              grossProfit: revenueM * (row.grossMargin || 0) / 100,
              grossMargin: row.grossMargin || 0,
              ebitda: revenueM * (row.ebitdaMargin || 0) / 100,
              ebitdaMargin: row.ebitdaMargin || 0,
              freeCashFlow: fcf,
              fcf: fcf,
              fcfMargin: row.fcfMargin || 0,
              netIncome: netIncome,
              netIncomeMargin: revenueM > 0 ? (netIncome / revenueM) * 100 : 0,
              eps: (row.eps && row.eps > 0)
                ? row.eps
                : ((yf_data?.fy24_financials?.shares_outstanding || 0) > 0
                    ? (netIncome * 1_000_000) / (yf_data.fy24_financials.shares_outstanding)
                    : 0)
            };
          });

          // Recompute first-year forecast revenueGrowth using last historical year when available
          try {
            if (Array.isArray(result.projections) && result.projections.length > 0 && Array.isArray(yf_data.historical_financials) && yf_data.historical_financials.length > 0) {
              const first = result.projections[0];
              const parseYear = (y) => {
                const s = String(y || '').trim();
                if (s.startsWith('FY')) { const n = parseInt(s.slice(2), 10); return isNaN(n) ? null : 2000 + n; }
                const m = s.match(/\d{4}/); return m ? parseInt(m[0], 10) : null;
              };
              const firstYear = parseYear(first.year);
              // Find best matching historical year directly preceding first forecast
              let prevRev = null; let bestYear = -Infinity;
              for (const h of yf_data.historical_financials) {
                const hy = parseYear(h.year);
                if (hy != null && firstYear != null && hy < firstYear && hy > bestYear) { bestYear = hy; prevRev = h.revenue; }
              }
              if (prevRev && prevRev > 0 && first.revenue > 0) {
                first.revenueGrowth = ((first.revenue - prevRev) / prevRev) * 100;
              } else {
                first.revenueGrowth = null;
              }
            }
          } catch (_) { /* no-op */ }
        }
      } catch (enrichErr) {
        console.warn('Non-fatal: failed to enrich valuation with source metrics/projections:', enrichErr?.message);
      }

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

const generateValuationWithFeedback = async (ticker, method, selectedMultiple = 'auto', feedback) => {
  try {
    console.log('Generating valuation with feedback for:', { ticker, method, selectedMultiple, feedback });
    
    // Fetch the actual data from yfinance and Sonar
    const yf_data = await fetchFinancialsWithYfinance(ticker);
    const sonar_data = await fetchLatestWithSonar(ticker);
    
    console.log('Fetched data:', { yf_data, sonar_data });
    
    let prompt;
    
    if (method === 'dcf') {
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation for the company.

The company you will be analyzing is: ${(yf_data?.company_name) || ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below(which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${yf_data.fy24_financials.revenue.toLocaleString()}M
- Gross Margin: ${yf_data.fy24_financials.gross_margin_pct.toFixed(1)}%
- EBITDA: ${yf_data.fy24_financials.ebitda.toLocaleString()}M
- Net Income: ${yf_data.fy24_financials.net_income.toLocaleString()}M
- EPS: ${yf_data.fy24_financials.eps.toFixed(2)}
- Shares Outstanding: ${yf_data.fy24_financials.shares_outstanding.toLocaleString()}M

2. Investigate current industry trends and company-specific factors that may impact future performance. Find some market data below to help you.
MARKET DATA (from yfinance - most updated):
- Current Price: $${yf_data.market_data.current_price.toFixed(2)}
- Market Cap: ${yf_data.market_data.market_cap.toLocaleString()}M
- Enterprise Value: ${yf_data.market_data.enterprise_value ? yf_data.market_data.enterprise_value.toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${yf_data.market_data.pe_ratio ? yf_data.market_data.pe_ratio.toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonar_data.full_response || 'No Sonar data available'}

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
Company Name: ${(yf_data?.company_name) || ticker}

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

Current Share Price: $${yf_data.market_data.current_price.toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]

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
- Price/Sales: High-growth firms with negative or erratic earnings`;

      } else {
        multipleTypeInstruction = `Use ${selectedMultiple} multiple. For P/E multiples, set enterpriseValue to 0.`;
      }
      
      prompt = `You are a skilled financial analyst tasked with creating a precise financial forecast for a company up to the year 2029. This forecast will include projections for revenue growth, gross margin, EBITDA margin, FCF margin, EPS, and net income, ultimately leading to a fair value calculation using exit multiple valuation.

The company you will be analyzing is: ${(yf_data?.company_name) || ticker}

${feedback ? `USER FEEDBACK: ${feedback}

Please incorporate this feedback into your analysis and adjust the assumptions/projections accordingly.` : ''}

${multipleTypeInstruction}

To complete this task, follow these steps:
IMPORTANT: Use the following MOST UPDATED financial data and insights for your analysis. This represents the most current and reliable information available:

Use the FY2024 actuals as your starting point and project forward based on:
1. The full Sonar response below (which contains the latest quarterly trends, management commentary, guidance, and recent developments)
2. The yfinance data below(which provides the most current financial metrics)
3. Your financial analysis expertise to interpret trends and project future performance

1. FY2024 ACTUAL FINANCIALS (from yfinance - most updated):
- Revenue: ${yf_data.fy24_financials.revenue.toLocaleString()}M
- Gross Margin: ${yf_data.fy24_financials.gross_margin_pct.toFixed(1)}%
- EBITDA: ${yf_data.fy24_financials.ebitda.toLocaleString()}M
- Net Income: ${yf_data.fy24_financials.net_income.toLocaleString()}M
- EPS: ${yf_data.fy24_financials.eps.toFixed(2)}
- Shares Outstanding: ${yf_data.fy24_financials.shares_outstanding.toLocaleString()}M

2. Investigate current industry trends and company-specific factors that may impact future performance. Find some market data below to help you.
MARKET DATA (from yfinance - most updated):
- Current Price: $${yf_data.market_data.current_price.toFixed(2)}
- Market Cap: ${yf_data.market_data.market_cap.toLocaleString()}M
- Enterprise Value: ${yf_data.market_data.enterprise_value ? yf_data.market_data.enterprise_value.toLocaleString() + 'M' : 'N/A'}
- P/E Ratio: ${yf_data.market_data.pe_ratio ? yf_data.market_data.pe_ratio.toFixed(2) : 'N/A'}

FULL SONAR RESPONSE - LATEST DEVELOPMENTS & INSIGHTS:
${sonar_data.full_response || 'No Sonar data available'}

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
Company Name: ${(yf_data?.company_name) || ticker}

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

Current Share Price: $${yf_data.market_data.current_price.toFixed(2)}

Assumptions and Justifications:
[Provide a detailed, company-specific explanation of key assumptions. Reference concrete figures from the Sonar insights (latest quarter trends, guidance) and yfinance actuals (FY2024 metrics, current price/market cap). Include at least 6-10 bullet points covering growth drivers, product/segment dynamics, margin levers, capital intensity, competitive landscape, and risks.]

</forecast>

Return ONLY the <forecast> section as specified above, without any additional commentary or explanations outside of the designated areas within the forecast.`;

    } else {
      throw new Error(`Unsupported valuation method: ${method}`);
    }

    const referer = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001';
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
      body: JSON.stringify({
        model: 'x-ai/grok-code-fast-1',
        messages: [
          {
            role: 'system',
            content: 'You are a skilled financial analyst. You MUST return your response in the EXACT format specified in the user prompt. The response MUST start with <forecast> and end with </forecast>. Do not include any text outside these tags.'
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Failed to parse error response' } }));
      console.error('OpenRouter API error:', error);
      
      if (response.status === 404) {
        throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol.`);
      }
      
      throw new Error(error.error?.message || 'Failed to generate valuation');
    }

    const data = await response.json();
    console.log('OpenRouter API response structure:', {
      choices: data.choices?.length,
      hasMessage: !!data.choices?.[0]?.message,
      messageContent: data.choices?.[0]?.message?.content?.substring(0, 100)
    });

    // Extract the text content from the OpenRouter response
    let valuationText;
    if (data.choices?.[0]?.message?.content) {
      valuationText = data.choices[0].message.content;
    } else {
      console.error('Response structure:', data);
      throw new Error('Invalid response from OpenRouter API: No content found');
    }

    if (!valuationText) {
      console.error('Empty valuation text');
      throw new Error('Invalid response from OpenRouter API: Empty text content');
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

      // Extract the financial analysis section (mirror GET path)
      let financialAnalysisText = '';
      const analysisMatch = valuationText.match(/<financial_analysis>([\s\S]*?)<\/financial_analysis>/i);
      if (analysisMatch) {
        financialAnalysisText = analysisMatch[1];
        console.log('Financial analysis (feedback) extracted successfully, length:', financialAnalysisText.length);
      } else {
        console.log('No financial analysis tags found in feedback, trying fallback extraction...');
        const fallbackMatch = valuationText.match(/(\*\*Financial.*?)(?=<forecast>|$)/s);
        if (fallbackMatch) {
          financialAnalysisText = fallbackMatch[1];
          console.log('Financial analysis (feedback) extracted via fallback, length:', financialAnalysisText.length);
        } else {
          const beforeForecastMatch = valuationText.match(/(.*?)(?=<forecast>)/s);
          if (beforeForecastMatch && beforeForecastMatch[1].trim()) {
            financialAnalysisText = beforeForecastMatch[1].trim();
            console.log('Financial analysis (feedback) extracted from content before forecast, length:', financialAnalysisText.length);
          } else {
            const anyAnalysisMatch = valuationText.match(/(.*?)(?=Financial Forecast|Year \| Revenue)/s);
            if (anyAnalysisMatch && anyAnalysisMatch[1].trim()) {
              financialAnalysisText = anyAnalysisMatch[1].trim();
              console.log('Financial analysis (feedback) extracted from general content, length:', financialAnalysisText.length);
            } else {
              console.log('No financial analysis found in feedback response');
            }
          }
        }
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
          if (columns.length >= 2) {
            const year = columns[0];
            const revenue = columns[1] ? parseFloat(columns[1].replace(/,/g, '')) : 0;
            const revenueGrowth = columns[2] ? parseFloat(String(columns[2]).replace('%', '')) : 0;
            const grossMargin = columns[3] ? parseFloat(String(columns[3]).replace('%', '')) : 0;
            const ebitdaMargin = columns[4] ? parseFloat(String(columns[4]).replace('%', '')) : 0;
            const fcfMargin = columns[5] ? parseFloat(String(columns[5]).replace('%', '')) : 0;
            const netIncome = columns[6] ? parseFloat(columns[6].replace(/,/g, '')) : 0;
            const eps = columns[7] ? parseFloat(columns[7]) : 0;

            tableData.push({
              year,
              revenue: isNaN(revenue) ? 0 : revenue,
              revenueGrowth: isNaN(revenueGrowth) ? 0 : revenueGrowth,
              grossMargin: isNaN(grossMargin) ? 0 : grossMargin,
              ebitdaMargin: isNaN(ebitdaMargin) ? 0 : ebitdaMargin,
              fcfMargin: isNaN(fcfMargin) ? 0 : fcfMargin,
              netIncome: isNaN(netIncome) ? 0 : netIncome,
              eps: isNaN(eps) ? 0 : eps
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
      const fairValueMatch = forecastText.match(/Fair Value:\s*[€$]([\d,]+(?:\.[\d]+)?)\s*million/i);
      if (fairValueMatch) {
        fairValue = parseFloat(fairValueMatch[1].replace(/,/g, ''));
        console.log('Extracted million fair value (feedback):', fairValue);
      } else {
        // For exit-multiple method, also check for per-share format
        if (method === 'exit-multiple') {
          console.log('Looking for per-share fair value in (feedback):', forecastText.substring(0, 500));
          const perShareMatch = forecastText.match(/Fair Value:\s*[€$]([\d,]+(?:\.\d+)?)\s*per\s*share/i);
          console.log('Per-share regex match (feedback):', perShareMatch);
          if (perShareMatch) {
            // For per-share values, store the per-share value directly
            fairValue = parseFloat(perShareMatch[1].replace(/,/g, ''));
            console.log('Extracted per-share fair value (feedback):', fairValue);
          } else {
            console.log('No per-share match found in feedback. Looking for pattern in text...');
            const fairValueLine = forecastText.match(/Fair Value:.*per share/i);
            console.log('Fair value line found (feedback):', fairValueLine);
          }
        }
      }

      // Extract current share price
      let currentSharePrice = 0;
      const currentPriceMatch = forecastText.match(/Current Share Price:\s*[€$]([\d,]+(?:\.\d+)?)/i);
      if (currentPriceMatch) {
        currentSharePrice = parseFloat(currentPriceMatch[1].replace(/,/g, ''));
        console.log('Extracted current share price (feedback):', currentSharePrice);
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
          financialAnalysis: financialAnalysisText,
          latestDevelopments: (typeof sonar_data !== 'undefined' && sonar_data?.full_response) ? sonar_data.full_response : ''
        }
      };

      // Enrich with source metrics for correct upside/CAGR and frontend display
      try {
        // Attach yfinance and sonar summaries captured earlier in this scope
        if (typeof yf_data !== 'undefined' && yf_data && yf_data.fy24_financials && yf_data.market_data) {
          result.sourceMetrics = {
            currentPrice: yf_data.market_data.current_price || 0,
            marketCap: yf_data.market_data.market_cap || 0, // USD
            sharesOutstanding: yf_data.fy24_financials.shares_outstanding || 0, // in millions
            // Normalize EV to millions so it matches projection units
            enterpriseValue: (yf_data.market_data.enterprise_value || 0) / 1_000_000
          };
          // Actual 2024 data for historical row
          result.actual2024 = {
            revenue: (yf_data.fy24_financials.revenue || 0) / 1_000_000, // normalize to M
            grossProfit: (yf_data.fy24_financials.gross_profit || 0) / 1_000_000,
            ebitda: (yf_data.fy24_financials.ebitda || 0) / 1_000_000,
            netIncome: (yf_data.fy24_financials.net_income || 0) / 1_000_000,
            eps: yf_data.fy24_financials.eps || 0,
            capex: 0,
            workingCapital: 0,
            fcf: 0
          };
          
          // Add currency information
          if (yf_data.currency_info) {
            result.currencyInfo = yf_data.currency_info;
            console.log('Currency conversion info (feedback):', yf_data.currency_info);
          }
          
          // Add historical financials
          if (yf_data.historical_financials) {
            result.historicalFinancials = yf_data.historical_financials;
            console.log('Historical financials (feedback):', yf_data.historical_financials);
          }
        }
        if (typeof sonar_data !== 'undefined' && sonar_data) {
          result.latestDevelopments = sonar_data.full_response || '';
          result.sonar = sonar_data;
        }

        // Compute projections array from tableData so frontend/exports have structured values
        if (Array.isArray(tableData) && tableData.length > 0) {
          result.projections = tableData.map((row) => {
            const revenueM = row.revenue || 0;
            const netIncome = row.netIncome || 0;
            const fcf = revenueM * (row.fcfMargin || 0) / 100;

            // Override 2024 with yfinance actuals when available
            if (row.year === '2024' && typeof yf_data !== 'undefined' && yf_data && yf_data.fy24_financials) {
              const fy = yf_data.fy24_financials;
              const revM = (fy.revenue || 0) / 1_000_000;
              const gpM = typeof fy.gross_profit === 'number' ? (fy.gross_profit || 0) / 1_000_000 : revM * ((fy.gross_margin_pct || 0) / 100);
              const ebitdaM = (fy.ebitda || 0) / 1_000_000;
              const fcfM = typeof fy.fcf === 'number' ? (fy.fcf || 0) / 1_000_000 : revM * ((fy.fcf_margin_pct || row.fcfMargin || 0) / 100);
              const fcfMarginPct = (fy.fcf_margin_pct != null) ? fy.fcf_margin_pct : (revM > 0 ? (fcfM / revM) * 100 : 0);
              const netIncomeM = (fy.net_income || 0) / 1_000_000;
              const netIncomeMarginPct = revM > 0 ? (netIncomeM / revM) * 100 : 0;
              return {
                year: row.year,
                revenue: revM,
                revenueGrowth: row.revenueGrowth || 0,
                grossProfit: gpM,
                grossMargin: fy.gross_margin_pct || row.grossMargin || 0,
                ebitda: ebitdaM,
                ebitdaMargin: fy.ebitda_margin_pct || row.ebitdaMargin || 0,
                freeCashFlow: fcfM,
                fcf: fcfM,
                fcfMargin: fcfMarginPct,
                netIncome: netIncomeM,
                netIncomeMargin: netIncomeMarginPct,
                eps: fy.eps || row.eps || 0
              };
            }

            return {
              year: row.year,
              revenue: revenueM,
              revenueGrowth: row.revenueGrowth || 0,
              grossProfit: revenueM * (row.grossMargin || 0) / 100,
              grossMargin: row.grossMargin || 0,
              ebitda: revenueM * (row.ebitdaMargin || 0) / 100,
              ebitdaMargin: row.ebitdaMargin || 0,
              freeCashFlow: fcf,
              fcf: fcf,
              fcfMargin: row.fcfMargin || 0,
              netIncome: netIncome,
              netIncomeMargin: revenueM > 0 ? (netIncome / revenueM) * 100 : 0,
              eps: row.eps || 0
            };
          });
        }
      } catch (enrichErr) {
        console.warn('Non-fatal: failed to enrich valuation with source metrics/projections:', enrichErr?.message);
      }

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

  // Helper function to safely process strings
  const safeString = (val) => {
    if (typeof val !== 'string') return 'No data available';
    return val.replace(/<cite[^>]*>.*?<\/cite>/g, '').replace(/\s+/g, ' ').trim();
  };

  // Helper function to safely process arrays
  const safeArray = (val) => {
    if (!Array.isArray(val)) return [];
    return val.map(item => typeof item === 'string' ? safeString(item) : item);
  };

  // Normalize field names for analysis
  const normalizedAnalysis = {
    companyOverview: safeString(analysis.companyOverview || analysis.company_overview || 'No overview available'),
    keyDrivers: safeArray(analysis.keyDrivers || analysis.key_drivers || []),
    risks: safeArray(analysis.risks || []),
    sensitivity: {
      bullCase: parseFloat(analysis.sensitivity?.bullCase || analysis.sensitivity?.bull_case || 0),
      baseCase: parseFloat(analysis.sensitivity?.baseCase || analysis.sensitivity?.base_case || 0),
      bearCase: parseFloat(analysis.sensitivity?.bearCase || analysis.sensitivity?.bear_case || 0)
    },
    multipleExplanation: method === 'exit-multiple' ? safeString(analysis.multipleExplanation || 'No explanation provided') : null,
    // Add new financial analysis fields
    historicalFinancialSummary: safeString(analysis.historicalFinancialSummary || 'No historical data available'),
    industryTrends: safeArray(analysis.industryTrends || []),
    revenueGrowthAnalysis: safeString(analysis.revenueGrowthAnalysis || 'No revenue growth analysis available'),
    marginAnalysis: safeString(analysis.marginAnalysis || 'No margin analysis available'),
    exitMultipleRationale: safeString(analysis.exitMultipleRationale || 'No exit multiple rationale available')
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
      [normalizedAnalysis.historicalFinancialSummary],
      [],
      ['Industry Trends'],
      ...(normalizedAnalysis.industryTrends || []).map(t => [t]),
      [],
      ['Revenue Growth Analysis'],
      [normalizedAnalysis.revenueGrowthAnalysis],
      [],
      ['Margin Analysis'],
      [normalizedAnalysis.marginAnalysis],
      [],
      ['Exit Multiple Rationale'],
      [normalizedAnalysis.exitMultipleRationale],
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

  // Check if this is an internal Vercel call
  const headers = nextHeaders();
  const protectionBypass = headers.get('x-vercel-protection-bypass') || headers.get('X-Vercel-Protection-Bypass');
  const automationBypass = headers.get('x-vercel-automation-bypass') || headers.get('X-Vercel-Automation-Bypass');
  const isInternalCall = protectionBypass || automationBypass;
  
  console.log('DCF Valuation - Header check:', {
    protectionBypass: protectionBypass ? 'SET' : 'NOT SET',
    automationBypass: automationBypass ? 'SET' : 'NOT SET',
    isInternalCall,
    allHeaders: Object.fromEntries(headers.entries()),
    vercelUrl: process.env.VERCEL_URL,
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
    rawProtectionBypass: headers.get('x-vercel-protection-bypass'),
    rawAutomationBypass: headers.get('x-vercel-automation-bypass')
  });
  
  // For Vercel, if we don't have bypass headers but we're missing the API key, 
  // assume it's an internal call and proceed
  const shouldSkipApiKeyCheck = isInternalCall || (!process.env.OPENROUTER_API_KEY && process.env.VERCEL_URL);
  
  if (shouldSkipApiKeyCheck) {
    console.log('Skipping API key check - internal call or missing key on Vercel');
  } else {
    // Check API key for external calls
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured');
      return NextResponse.json(
        { error: 'API configuration error' },
        { status: 500 }
      );
    }
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
      // Source data for frontend and accurate upside
      sourceMetrics: rawValuation.sourceMetrics || null,
      latestDevelopments: rawValuation.latestDevelopments || null,
      sonar: rawValuation.sonar || null,
      actual2024: rawValuation.actual2024 || null,
      historicalFinancials: rawValuation.historicalFinancials || null,
      projections: rawValuation.projections || null,
      // Calculate upside and CAGR
      upside: 0, // Will be calculated based on method
      cagr: 0, // Will be calculated based on method
      confidence: 'Medium',
      upside2029: 0,
      cagr2029: 0
    };

    // Calculate upside and CAGR based on method
    try {
      if (method === 'exit-multiple') {
        // For exit multiple methods, calculate upside manually using LLM projections and yfinance data
        const currentPrice = (rawValuation?.sourceMetrics?.currentPrice) || rawValuation.currentSharePrice || 0;
        const currentEV = (rawValuation?.sourceMetrics?.enterpriseValue) || 0;
        
        // Get the 2029 projection from LLM
        const projections = rawValuation.projections || [];
        const finalYearProjection = projections.find(p => p.year === '2029') || projections[projections.length - 1];
        
        if (finalYearProjection && rawValuation.exitMultipleValue && rawValuation.exitMultipleType) {
          let calculatedFairValue = 0;
          let calculatedUpside = 0;
          let calculationDetails = '';
          
          // Log the projection data for debugging
          console.log('Using projection for calculation:', {
            year: finalYearProjection.year,
            revenue: finalYearProjection.revenue,
            ebitda: finalYearProjection.ebitda,
            freeCashFlow: finalYearProjection.freeCashFlow,
            eps: finalYearProjection.eps,
            allProjections: projections,
            rawValuationProjections: rawValuation.projections
          });
          
          // Also log the raw forecast data for comparison
          console.log('Raw forecast data for 2029:', {
            rawForecast: rawValuation.rawForecast?.substring(0, 500),
            hasRawForecast: !!rawValuation.rawForecast
          });
          
          switch (rawValuation.exitMultipleType) {
            case 'P/E':
              // P/E: Fair Value = 2029 EPS × P/E Multiple
              const eps2029 = finalYearProjection.eps || 0;
              calculatedFairValue = eps2029 * rawValuation.exitMultipleValue;
              calculatedUpside = ((calculatedFairValue - currentPrice) / currentPrice) * 100;
              
              calculationDetails = `Fair Value Calculation:
2029 EPS: $${eps2029.toFixed(2)}
P/E Multiple: ${rawValuation.exitMultipleValue}x
Fair Value per Share: $${eps2029.toFixed(2)} × ${rawValuation.exitMultipleValue} = $${calculatedFairValue.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Upside: ($${calculatedFairValue.toFixed(2)} - $${currentPrice.toFixed(2)}) / $${currentPrice.toFixed(2)} × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'EV/EBITDA':
              // EV/EBITDA: Fair EV = 2029 EBITDA × EV/EBITDA Multiple
              const ebitda2029 = finalYearProjection.ebitda || 0;
              const fairEV = ebitda2029 * rawValuation.exitMultipleValue;
              calculatedFairValue = fairEV / 1000; // Convert to millions for display
              calculatedUpside = currentEV > 0 ? ((fairEV - currentEV) / currentEV) * 100 : 0;
              
              calculationDetails = `Fair Value Calculation:
2029 EBITDA: $${ebitda2029.toFixed(1)}M
EV/EBITDA Multiple: ${rawValuation.exitMultipleValue}x
Fair Enterprise Value: $${ebitda2029.toFixed(1)}M × ${rawValuation.exitMultipleValue} = $${fairEV.toFixed(1)}M
Current Enterprise Value: $${(currentEV / 1000000).toFixed(1)}M
Upside: ($${fairEV.toFixed(1)}M - $${(currentEV / 1000000).toFixed(1)}M) / $${(currentEV / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'EV/FCF':
              // EV/FCF: Fair EV = 2029 FCF × EV/FCF Multiple
              const fcf2029 = finalYearProjection.freeCashFlow || 0;
              const fairEVFCF = fcf2029 * rawValuation.exitMultipleValue;
              calculatedFairValue = fairEVFCF / 1000; // Convert to millions for display
              calculatedUpside = currentEV > 0 ? ((fairEVFCF - currentEV) / currentEV) * 100 : 0;
              
              // Debug the calculation values
              console.log('EV/FCF Calculation Debug:', {
                fcf2029,
                multiple: rawValuation.exitMultipleValue,
                fairEVFCF,
                currentEV,
                calculatedUpside,
                calculation: `(${fairEVFCF} - ${currentEV}) / ${currentEV} * 100 = ${calculatedUpside}`,
                finalYearProjection: finalYearProjection,
                projections: projections
              });
              
              calculationDetails = `Fair Value Calculation:
2029 Free Cash Flow: $${fcf2029.toFixed(1)}M
EV/FCF Multiple: ${rawValuation.exitMultipleValue}x
Fair Enterprise Value: $${fcf2029.toFixed(1)}M × ${rawValuation.exitMultipleValue} = $${fairEVFCF.toFixed(1)}M
Current Enterprise Value: $${(currentEV / 1000000).toFixed(1)}M
Upside: ($${fairEVFCF.toFixed(1)}M - $${(currentEV / 1000000).toFixed(1)}M) / $${(currentEV / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'Price/Sales':
              // Price/Sales: Fair Market Cap = 2029 Revenue × Price/Sales Multiple
              const revenue2029 = finalYearProjection.revenue || 0;
              const fairMarketCapSales = revenue2029 * rawValuation.exitMultipleValue;
              calculatedFairValue = fairMarketCapSales / 1000; // Convert to millions for display
              calculatedUpside = currentMarketCap > 0 ? ((fairMarketCapSales - currentMarketCap) / currentMarketCap) * 100 : 0;
              
              calculationDetails = `Fair Value Calculation:
2029 Revenue: $${revenue2029.toFixed(1)}M
Price/Sales Multiple: ${rawValuation.exitMultipleValue}x
Fair Market Cap: $${revenue2029.toFixed(1)}M × ${rawValuation.exitMultipleValue} = $${fairMarketCapSales.toFixed(1)}M
Current Market Cap: $${(currentMarketCap / 1000000).toFixed(1)}M
Upside: ($${fairMarketCapSales.toFixed(1)}M - $${(currentMarketCap / 1000000).toFixed(1)}M) / $${(currentMarketCap / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            default:
              calculatedUpside = 0;
              calculationDetails = 'Unknown exit multiple type';
          }
          
          // Calculate CAGR based on the upside
          result.upside = calculatedUpside;
          result.cagr = (Math.pow(1 + (calculatedUpside / 100), 1 / 5) - 1) * 100;
          
          // Store calculation details for frontend display
          result.exitMultipleCalculation = {
            type: rawValuation.exitMultipleType,
            multiple: rawValuation.exitMultipleValue,
            fairValue: calculatedFairValue,
            calculationDetails: calculationDetails
          };
          
          console.log('Exit multiple calculation:', {
            type: rawValuation.exitMultipleType,
            multiple: rawValuation.exitMultipleValue,
            calculatedUpside,
            calculatedCAGR: result.cagr,
            calculationDetails
          });
        } else {
          console.log('Missing data for exit multiple calculation:', {
            hasProjections: !!projections.length,
            hasMultiple: !!rawValuation.exitMultipleValue,
            hasType: !!rawValuation.exitMultipleType
          });
          result.upside = 0;
          result.cagr = 0;
        }
      } else if (method === 'dcf') {
        // For DCF, calculate upside based on current market cap vs fair value (both in $)
        const fairValueInMillions = rawValuation.fairValue; // in $M
        const fairValueInDollars = (fairValueInMillions || 0) * 1_000_000;
        const yfm = rawValuation?.sourceMetrics || {};
        const currentPrice = yfm.currentPrice || rawValuation.currentSharePrice || 0;
        let currentMarketCap = 0;
        if (yfm.marketCap && yfm.marketCap > 0) {
          currentMarketCap = yfm.marketCap; // already in $
        } else if (currentPrice > 0 && yfm.sharesOutstanding && yfm.sharesOutstanding > 0) {
          currentMarketCap = currentPrice * yfm.sharesOutstanding;
        }
        console.log('Calculating DCF upside:', { currentPrice, fairValueInMillions, marketCap: currentMarketCap });
        if (currentMarketCap > 0 && fairValueInDollars > 0) {
          result.upside = ((fairValueInDollars - currentMarketCap) / currentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / currentMarketCap, 1 / 5) - 1) * 100;
          console.log('Calculated DCF upside/CAGR:', { upside: result.upside, cagr: result.cagr });
        } else {
          console.log('Skipping DCF upside calculation - invalid market cap or fair value');
        }
      }
    } catch (calcError) {
      console.error('Error calculating upside/CAGR:', calcError);
      // Don't fail the entire request, just set defaults
      result.upside = 0;
      result.cagr = 0;
    }

    console.log('Returning raw forecast result:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      sections: Object.keys(result.sections)
    });

    console.log('About to return response with result structure:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      fairValue: result.fairValue,
      currentSharePrice: result.currentSharePrice,
      upside: result.upside,
      cagr: result.cagr
    });

    try {
      return NextResponse.json(result);
    } catch (returnError) {
      console.error('Error returning response:', returnError);
      throw returnError;
    }
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

  console.log('POST request received:', { ticker, method, selectedMultiple });

  // Validate required parameters
  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker symbol is required' },
      { status: 400 }
    );
  }

  // Check if this is an internal Vercel call
  const headers = nextHeaders();
  const protectionBypass = headers.get('x-vercel-protection-bypass') || headers.get('X-Vercel-Protection-Bypass');
  const automationBypass = headers.get('x-vercel-automation-bypass') || headers.get('X-Vercel-Automation-Bypass');
  const isInternalCall = protectionBypass || automationBypass;
  
  console.log('DCF Valuation - Header check:', {
    protectionBypass: protectionBypass ? 'SET' : 'NOT SET',
    automationBypass: automationBypass ? 'SET' : 'NOT SET',
    isInternalCall,
    allHeaders: Object.fromEntries(headers.entries()),
    vercelUrl: process.env.VERCEL_URL,
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
    rawProtectionBypass: headers.get('x-vercel-protection-bypass'),
    rawAutomationBypass: headers.get('x-vercel-automation-bypass')
  });
  
  // For Vercel, if we don't have bypass headers but we're missing the API key, 
  // assume it's an internal call and proceed
  const shouldSkipApiKeyCheck = isInternalCall || (!process.env.OPENROUTER_API_KEY && process.env.VERCEL_URL);
  
  if (shouldSkipApiKeyCheck) {
    console.log('Skipping API key check - internal call or missing key on Vercel');
  } else {
    // Check API key for external calls
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured');
      return NextResponse.json(
        { error: 'API configuration error' },
        { status: 500 }
      );
    }
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
    let valuation = await generateValuationWithFeedback(ticker, method, selectedMultiple, feedback);
    
    console.log('Feedback valuation result:', {
      hasRawForecast: !!valuation?.rawForecast,
      companyName: valuation?.companyName,
      method: valuation?.method,
      fairValue: valuation?.fairValue,
      currentSharePrice: valuation?.currentSharePrice
    });

    // If response looks incomplete, retry once with stricter guidance
    const looksIncomplete = !valuation?.rawForecast?.includes('Year | Revenue') || (!valuation?.fairValue && !valuation?.currentSharePrice);
    if (looksIncomplete) {
      console.warn('Feedback valuation incomplete. Retrying once with stricter guidance...');
      const stricterFeedback = `${feedback}\n\nIMPORTANT: Ensure the <forecast> section includes exact lines:\n- Fair Value: <currency><space><value> per share\n- Current Share Price: <currency><space><value>\nAnd include the full 7-column forecast table starting with: Year | Revenue ($M) | Revenue Growth (%) | ...`;
      try {
        const secondAttempt = await generateValuation(ticker, method, selectedMultiple, stricterFeedback);
        if (secondAttempt?.rawForecast?.includes('Year | Revenue') && (secondAttempt?.fairValue || secondAttempt?.currentSharePrice)) {
          console.log('Retry with stricter guidance succeeded. Using second attempt.');
          valuation = secondAttempt;
        } else {
          console.warn('Retry with stricter guidance did not yield complete data. Keeping first attempt.');
        }
      } catch (retryErr) {
        console.error('Retry with stricter guidance failed:', retryErr);
      }
    }

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
      // Source data for frontend and accurate upside
      sourceMetrics: valuation.sourceMetrics || null,
      latestDevelopments: valuation.latestDevelopments || null,
      sonar: valuation.sonar || null,
      actual2024: valuation.actual2024 || null,
      historicalFinancials: valuation.historicalFinancials || null,
      projections: valuation.projections || null,
      // Calculate upside and CAGR
      upside: 0, // Will be calculated based on method
      cagr: 0, // Will be calculated based on method
      confidence: 'Medium',
      upside2029: 0,
      cagr2029: 0
    };

    // Calculate upside and CAGR based on method
    try {
      if (method === 'exit-multiple') {
        // For all exit multiple methods, calculate upside based on current price vs fair value per share
        const currentPrice = (valuation?.sourceMetrics?.currentPrice) || valuation.currentSharePrice || 0;
        const currentEV = (valuation?.sourceMetrics?.enterpriseValue) || 0;
        
        // Get the 2029 projection from LLM
        const projections = valuation.projections || [];
        const finalYearProjection = projections.find(p => p.year === '2029') || projections[projections.length - 1];
        
        if (finalYearProjection && valuation.exitMultipleValue && valuation.exitMultipleType) {
          let calculatedFairValue = 0;
          let calculatedUpside = 0;
          let calculationDetails = '';
          
          switch (valuation.exitMultipleType) {
            case 'P/E':
              // P/E: Fair Value = 2029 EPS × P/E Multiple
              const eps2029 = finalYearProjection.eps || 0;
              calculatedFairValue = eps2029 * valuation.exitMultipleValue;
              calculatedUpside = ((calculatedFairValue - currentPrice) / currentPrice) * 100;
              
              calculationDetails = `Fair Value Calculation:
2029 EPS: $${eps2029.toFixed(2)}
P/E Multiple: ${valuation.exitMultipleValue}x
Fair Value per Share: $${eps2029.toFixed(2)} × ${valuation.exitMultipleValue} = $${calculatedFairValue.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Upside: ($${calculatedFairValue.toFixed(2)} - $${currentPrice.toFixed(2)}) / $${currentPrice.toFixed(2)} × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'EV/EBITDA':
              // EV/EBITDA: Fair EV = 2029 EBITDA × EV/EBITDA Multiple
              const ebitda2029 = finalYearProjection.ebitda || 0;
              const fairEV = ebitda2029 * valuation.exitMultipleValue;
              calculatedFairValue = fairEV / 1000; // Convert to millions for display
              calculatedUpside = currentEV > 0 ? ((fairEV - currentEV) / currentEV) * 100 : 0;
              
              calculationDetails = `Fair Value Calculation:
2029 EBITDA: $${ebitda2029.toFixed(1)}M
EV/EBITDA Multiple: ${valuation.exitMultipleValue}x
Fair Enterprise Value: $${ebitda2029.toFixed(1)}M × ${valuation.exitMultipleValue} = $${fairEV.toFixed(1)}M
Current Enterprise Value: $${(currentEV / 1000000).toFixed(1)}M
Upside: ($${fairEV.toFixed(1)}M - $${(currentEV / 1000000).toFixed(1)}M) / $${(currentEV / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'EV/FCF':
              // EV/FCF: Fair EV = 2029 FCF × EV/FCF Multiple
              const fcf2029 = finalYearProjection.freeCashFlow || 0;
              const fairEVFCF = fcf2029 * valuation.exitMultipleValue;
              calculatedFairValue = fairEVFCF / 1000; // Convert to millions for display
              calculatedUpside = currentEV > 0 ? ((fairEVFCF - currentEV) / currentEV) * 100 : 0;
              
              calculationDetails = `Fair Value Calculation:
2029 Free Cash Flow: $${fcf2029.toFixed(1)}M
EV/FCF Multiple: ${valuation.exitMultipleValue}x
Fair Enterprise Value: $${fcf2029.toFixed(1)}M × ${valuation.exitMultipleValue} = $${fairEVFCF.toFixed(1)}M
Current Enterprise Value: $${(currentEV / 1000000).toFixed(1)}M
Upside: ($${fairEVFCF.toFixed(1)}M - $${(currentEV / 1000000).toFixed(1)}M) / $${(currentEV / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            case 'Price/Sales':
              // Price/Sales: Fair Market Cap = 2029 Revenue × Price/Sales Multiple
              const revenue2029 = finalYearProjection.revenue || 0;
              const fairMarketCapSales = revenue2029 * valuation.exitMultipleValue;
              calculatedFairValue = fairMarketCapSales / 1000; // Convert to millions for display
              calculatedUpside = currentMarketCap > 0 ? ((fairMarketCapSales - currentMarketCap) / currentMarketCap) * 100 : 0;
              
              calculationDetails = `Fair Value Calculation:
2029 Revenue: $${revenue2029.toFixed(1)}M
Price/Sales Multiple: ${valuation.exitMultipleValue}x
Fair Market Cap: $${revenue2029.toFixed(1)}M × ${valuation.exitMultipleValue} = $${fairMarketCapSales.toFixed(1)}M
Current Market Cap: $${(currentMarketCap / 1000000).toFixed(1)}M
Upside: ($${fairMarketCapSales.toFixed(1)}M - $${(currentMarketCap / 1000000).toFixed(1)}M) / $${(currentMarketCap / 1000000).toFixed(1)}M × 100 = ${calculatedUpside.toFixed(1)}%`;
              break;
              
            default:
              calculatedUpside = 0;
              calculationDetails = 'Unknown exit multiple type';
          }
          
          // Calculate CAGR based on the upside
          result.upside = calculatedUpside;
          result.cagr = (Math.pow(1 + (calculatedUpside / 100), 1 / 5) - 1) * 100;
          
          // Store calculation details for frontend display
          result.exitMultipleCalculation = {
            type: valuation.exitMultipleType,
            multiple: valuation.exitMultipleValue,
            fairValue: calculatedFairValue,
            calculationDetails: calculationDetails
          };
          
          console.log('Exit multiple calculation (feedback):', {
            type: valuation.exitMultipleType,
            multiple: valuation.exitMultipleValue,
            calculatedUpside,
            calculatedCAGR: result.cagr,
            calculationDetails
          });
        } else {
          console.log('Missing data for exit multiple calculation (feedback):', {
            hasProjections: !!projections.length,
            hasMultiple: !!valuation.exitMultipleValue,
            hasType: !!valuation.exitMultipleType
          });
          result.upside = 0;
          result.cagr = 0;
        }
      } else if (method === 'dcf') {
        // For DCF, calculate upside based on current market cap vs fair value (both in $)
        const fairValueInMillions = valuation.fairValue; // in $M
        const fairValueInDollars = (fairValueInMillions || 0) * 1_000_000;
        const yfm = valuation?.sourceMetrics || {};
        const currentPrice = yfm.currentPrice || valuation.currentSharePrice || 0;
        let currentMarketCap = 0;
        if (yfm.marketCap && yfm.marketCap > 0) {
          currentMarketCap = yfm.marketCap; // already in $
        } else if (currentPrice > 0 && yfm.sharesOutstanding && yfm.sharesOutstanding > 0) {
          currentMarketCap = currentPrice * yfm.sharesOutstanding;
        }
        console.log('Calculating DCF upside:', { currentPrice, fairValueInMillions, marketCap: currentMarketCap });
        if (currentMarketCap > 0 && fairValueInDollars > 0) {
          result.upside = ((fairValueInDollars - currentMarketCap) / currentMarketCap) * 100;
          result.cagr = (Math.pow(fairValueInDollars / currentMarketCap, 1 / 5) - 1) * 100;
          console.log('Calculated DCF upside/CAGR:', { upside: result.upside, cagr: result.cagr });
        } else {
          console.log('Skipping DCF upside calculation - invalid market cap or fair value');
        }
      }
    } catch (calcError) {
      console.error('Error calculating upside/CAGR:', calcError);
      // Don't fail the entire request, just set defaults
      result.upside = 0;
      result.cagr = 0;
    }

    console.log('Returning feedback valuation result:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      sections: Object.keys(result.sections)
    });

    console.log('About to return response with result structure:', {
      hasRawForecast: !!result.rawForecast,
      hasFinancialAnalysis: !!result.rawFinancialAnalysis,
      companyName: result.companyName,
      method: result.method,
      fairValue: result.fairValue,
      currentSharePrice: result.currentSharePrice,
      upside: result.upside,
      cagr: result.cagr
    });

    try {
      return NextResponse.json(result);
    } catch (returnError) {
      console.error('Error returning response:', returnError);
      throw returnError;
    }
  } catch (error) {
    console.error('Error generating valuation with feedback:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate valuation with feedback' },
      { status: 500 }
    );
  }
} 