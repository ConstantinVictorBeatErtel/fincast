import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Helper function to safely convert values to numbers
function safeFloat(value, defaultValue = 0) {
  try {
    const num = parseFloat(value);
    return isNaN(num) || !isFinite(num) ? defaultValue : num;
  } catch {
    return defaultValue;
  }
}

// Generate fallback financial data using yahoo-finance2
async function generateFallbackFinancialData(ticker) {
  try {
    console.log(`Generating fallback data for ${ticker} using yahoo-finance2...`);

    // Get company info and current price
    const quote = await yahooFinance.quote(ticker);
    const currentPrice = safeFloat(quote.regularMarketPrice);
    const companyName = quote.longName || quote.shortName || ticker;
    const currency = quote.currency || 'USD';

    // Get financial statements
    const fundamentals = await yahooFinance.fundamentals(ticker, {
      modules: ['incomeStatementHistory', 'cashflowStatementHistory', 'balanceSheetHistory']
    });

    const incomeStatements = fundamentals?.incomeStatementHistory?.incomeStatementHistory || [];
    const cashFlowStatements = fundamentals?.cashflowStatementHistory?.cashflowStatements || [];

    // Process historical financial data
    const historical = [];
    const years = Math.min(4, incomeStatements.length); // Get up to 4 years of data

    for (let i = 0; i < years; i++) {
      const income = incomeStatements[i] || {};
      const cashflow = cashFlowStatements[i] || {};

      // Extract financial metrics
      const revenue = safeFloat(income.totalRevenue) / 1_000_000; // Convert to millions
      const grossProfit = safeFloat(income.grossProfit) / 1_000_000;
      const ebitda = safeFloat(income.ebitda) / 1_000_000;
      const netIncome = safeFloat(income.netIncome) / 1_000_000;
      const eps = safeFloat(income.basicEPS);

      // Free cash flow calculation
      const operatingCashFlow = safeFloat(cashflow.totalCashFromOperatingActivities) / 1_000_000;
      const capex = safeFloat(cashflow.capitalExpenditures) / 1_000_000;
      const fcf = operatingCashFlow + capex; // capex is usually negative

      // Calculate margins
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
      const netIncomeMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
      const fcfMargin = revenue > 0 ? (fcf / revenue) * 100 : 0;

      // Calculate revenue growth (compared to previous year)
      let revenueGrowth = null;
      if (i < years - 1 && incomeStatements[i + 1]) {
        const prevRevenue = safeFloat(incomeStatements[i + 1].totalRevenue) / 1_000_000;
        if (prevRevenue > 0) {
          revenueGrowth = ((revenue - prevRevenue) / prevRevenue) * 100;
        }
      }

      // Format year label
      const endDate = income.endDate || new Date();
      const year = new Date(endDate).getFullYear();
      const yearLabel = `FY${year.toString().slice(-2)}`;

      historical.push({
        year: yearLabel,
        revenue: revenue,
        revenueGrowth: revenueGrowth,
        grossProfit: grossProfit,
        grossMargin: grossMargin,
        ebitda: ebitda,
        ebitdaMargin: ebitdaMargin,
        fcf: fcf,
        fcfMargin: fcfMargin,
        netIncome: netIncome,
        netIncomeMargin: netIncomeMargin,
        eps: eps
      });
    }

    // Get the most recent year's data for fy24_financials
    const latestIncome = incomeStatements[0] || {};
    const latestCashflow = cashFlowStatements[0] || {};

    const latestRevenue = safeFloat(latestIncome.totalRevenue);
    const latestGrossProfit = safeFloat(latestIncome.grossProfit);
    const latestEbitda = safeFloat(latestIncome.ebitda);
    const latestNetIncome = safeFloat(latestIncome.netIncome);
    const latestEps = safeFloat(latestIncome.basicEPS);

    const latestOCF = safeFloat(latestCashflow.totalCashFromOperatingActivities);
    const latestCapex = safeFloat(latestCashflow.capitalExpenditures);
    const latestFCF = latestOCF + latestCapex;

    const fy24_financials = {
      revenue: latestRevenue,
      gross_profit: latestGrossProfit,
      gross_margin_pct: latestRevenue > 0 ? (latestGrossProfit / latestRevenue) * 100 : 0,
      ebitda: latestEbitda,
      ebitda_margin_pct: latestRevenue > 0 ? (latestEbitda / latestRevenue) * 100 : 0,
      net_income: latestNetIncome,
      eps: latestEps,
      shares_outstanding: safeFloat(quote.sharesOutstanding),
      fcf: latestFCF,
      fcf_margin_pct: latestRevenue > 0 ? (latestFCF / latestRevenue) * 100 : 0
    };

    const market_data = {
      current_price: currentPrice,
      market_cap: safeFloat(quote.marketCap),
      enterprise_value: safeFloat(quote.enterpriseValue),
      pe_ratio: safeFloat(quote.trailingPE)
    };

    return {
      fy24_financials,
      market_data,
      company_name: companyName,
      source: "yahoo-finance2-fallback",
      currency_info: {
        original_currency: currency,
        converted_to_usd: false,
        conversion_rate: 1.0,
        exchange_rate_source: "none"
      },
      historical_financials: historical
    };

  } catch (error) {
    console.error('Error generating fallback financial data:', error);
    throw error;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const includePrices = searchParams.get('prices') === '1';
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
    }

    console.log(`Fetching yfinance data for ${ticker}...`);

    const pythonCmd = `${process.cwd()}/venv/bin/python3`;
    const scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;

    const isDarwin = process.platform === 'darwin';
    const isNodeRosetta = process.arch === 'x64';
    const cmd = isDarwin && isNodeRosetta ? '/usr/bin/arch' : pythonCmd;
    const args = isDarwin && isNodeRosetta ? ['-arm64', pythonCmd, scriptPath, ticker] : [scriptPath, ticker];

    const runLocalPython = async () => new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        if (code !== 0) {
          console.error('Python yfinance script exited non-zero:', code, stderr);
          return resolve(null);
        }
        try {
          const json = JSON.parse(stdout);
          resolve(json);
        } catch (e) {
          console.error('Failed to parse python output:', e);
          resolve(null);
        }
      });
      child.on('error', (err) => {
        console.error('Failed to start python process:', err);
        resolve(null);
      });
    });

    // On Vercel/production: prefer external Python API first
    let result = null;
    const isProd = !!process.env.VERCEL_URL || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    let externalPyApi = process.env.PY_YF_URL;

    if (isProd && externalPyApi) {
      try {
        let url = `${externalPyApi}?ticker=${encodeURIComponent(ticker)}`;
        // Prevent recursion if PY_YF_URL points to this same route on the same host
        try {
          const ext = new URL(url);
          const reqHost = request.headers.get('x-vercel-deployment-url') || request.headers.get('host');
          const sameHost = reqHost && (ext.host === reqHost || ext.host === reqHost?.replace(/^https?:\/\//, ''));
          const samePath = /\/api\/yfinance-data\/?$/.test(ext.pathname);
          if (sameHost && samePath) {
            console.error('PY_YF_URL points to this same route, causing recursion. Update PY_YF_URL to your Python function path.');
            throw new Error('PY_YF_URL misconfigured (recursive)');
          }
        } catch (_) {}

        // Fetch with timeout and capture body for diagnostics
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' }, signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.historical_financials) && json.historical_financials.length > 0) {
            result = json;
            console.log('Using external PY_YF_URL result (prod)');
          }
        } else {
          let bodyText = '';
          try { bodyText = await response.text(); } catch {}
          console.warn('External PY_YF_URL failed:', response.status, bodyText?.slice(0, 300));
        }
      } catch (e) {
        console.warn('External PY_YF_URL error:', e?.message);
      }
    }

    // In dev or if external failed, try local Python script
    if (!result && !isProd) {
      console.log('Using local python script (dev)');
      result = await runLocalPython();
    }

    // Final attempt in dev: try external as last resort
    if (!result && !isProd && externalPyApi) {
      try {
        const url = `${externalPyApi}?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.historical_financials) && json.historical_financials.length > 0) {
            result = json;
            console.log('Using external PY_YF_URL result (dev fallback)');
          }
        }
      } catch (e) {
        console.warn('External PY_YF_URL dev fallback error:', e?.message);
      }
    }

    // If still no result, create fallback using yahoo-finance2 for production
    if (!result && isProd) {
      console.log('Generating fallback financial data using yahoo-finance2...');
      try {
        result = await generateFallbackFinancialData(ticker);
        if (result) {
          console.log('Successfully generated fallback financial data');
        }
      } catch (fallbackError) {
        console.error('Fallback data generation failed:', fallbackError?.message);
      }
    }

    // If still no result, return explicit failure
    if (!result) {
      return NextResponse.json({ error: 'Failed to fetch yfinance data from PY_YF_URL and local python is unavailable' }, { status: 500 });
    }

    // Optionally attach 5y daily price series for portfolio tools only when requested
    let headers;
    if (includePrices) {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 5);
        const chart = await yahooFinance.chart(ticker, { period1: startDate, period2: endDate, interval: '1d' });
        const quotes = chart?.quotes || [];
        const historicalData = quotes.map(q => ({
          date: new Date(q.date).toISOString().split('T')[0],
          close: q.close,
          volume: q.volume,
        }));
        result.historicalData = historicalData;
        result.dataPoints = historicalData.length;
        headers = { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' };
      } catch (e) {
        console.warn('Failed to attach historical price series via chart():', e?.message);
        result.historicalData = [];
        result.dataPoints = 0;
      }
    }

    return NextResponse.json(result, headers ? { headers } : undefined);
  } catch (error) {
    console.error('Error in yfinance-data route:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
