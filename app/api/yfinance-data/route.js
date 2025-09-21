import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    
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
    const externalPyApi = process.env.PY_YF_URL;

    if (isProd && externalPyApi) {
      try {
        const url = `${externalPyApi}?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.historical_financials) && json.historical_financials.length > 0) {
            result = json;
            console.log('Using external PY_YF_URL result (prod)');
          }
        } else {
          console.warn('External PY_YF_URL failed:', response.status);
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

    // Final fallback: if still no result, attempt external even in dev
    if (!result && externalPyApi) {
      try {
        const url = `${externalPyApi}?ticker=${encodeURIComponent(ticker)}`;
        const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        if (response.ok) {
          const json = await response.json();
          if (json && Array.isArray(json.historical_financials) && json.historical_financials.length > 0) {
            result = json;
            console.log('Using external PY_YF_URL result (fallback)');
          }
        }
      } catch (e) {
        console.warn('External PY_YF_URL fallback error:', e?.message);
      }
    }

    // If external/local python failed, build a fallback from yahoo-finance2 summaries (prod-safe)
    if (!result) {
      try {
        console.log('Building fallback historical financials via yahoo-finance2');
        const modules = [
          'price',
          'summaryDetail',
          'defaultKeyStatistics',
          'financialData',
          'summaryProfile',
          'incomeStatementHistory',
          'cashflowStatementHistory'
        ];
        const summary = await yahooFinance.quoteSummary(ticker, { modules });
        const price = summary?.price || {};
        const summaryDetail = summary?.summaryDetail || {};
        const keyStats = summary?.defaultKeyStatistics || {};
        const financialData = summary?.financialData || {};
        const incomeHistoryArr = summary?.incomeStatementHistory?.incomeStatementHistory || [];
        const cashflowHistoryArr = summary?.cashflowStatementHistory?.cashflowStatements || [];

        const toNumber = (v) => {
          if (typeof v === 'number') return v;
          if (v && typeof v === 'object') {
            if (typeof v.raw === 'number') return v.raw;
            if (typeof v.longFmt === 'string') return Number(v.longFmt.replace(/[^\d.-]/g, '')) || 0;
            if (typeof v.fmt === 'string') return Number(v.fmt.replace(/[^\d.-]/g, '')) || 0;
          }
          return Number(v) || 0;
        };

        const latestIncome = incomeHistoryArr[0] || {};
        const latestCashflow = cashflowHistoryArr[0] || {};

        const totalRevenue = toNumber(latestIncome.totalRevenue);
        const grossProfit = toNumber(latestIncome.grossProfit);
        const ebitdaFromFD = toNumber(financialData.ebitda);
        const operatingIncome = toNumber(latestIncome.operatingIncome ?? latestIncome.ebit);
        const depreciation = toNumber(latestCashflow.depreciation ?? latestCashflow.depreciationAndAmortization);
        const ebitda = ebitdaFromFD || (operatingIncome + depreciation);
        const netIncome = toNumber(latestIncome.netIncome);
        const eps = toNumber(latestIncome.dilutedEPS ?? latestIncome.basicEPS);

        const operatingCF = toNumber(
          latestCashflow.totalCashFromOperatingActivities ?? latestCashflow.operatingCashflow
        );
        const capex = toNumber(latestCashflow.capitalExpenditures);
        const fcf = operatingCF + capex; // capex negative

        const fy24_financials = {
          revenue: totalRevenue,
          gross_profit: grossProfit,
          gross_margin_pct: totalRevenue ? (grossProfit / totalRevenue) * 100 : 0,
          ebitda: ebitda,
          ebitda_margin_pct: totalRevenue ? (ebitda / totalRevenue) * 100 : 0,
          net_income: netIncome,
          eps: eps,
          shares_outstanding: toNumber(price.sharesOutstanding || keyStats.sharesOutstanding),
          fcf: fcf,
          fcf_margin_pct: totalRevenue ? (fcf / totalRevenue) * 100 : 0
        };

        // Historical financials (up to 4 years, oldest->newest), convert to $M
        const toMillions = (n) => (typeof n === 'number' ? n / 1_000_000 : toNumber(n) / 1_000_000);
        const historical_financials = [];
        let prevRevM = null;
        incomeHistoryArr.slice(0, 4).reverse().forEach((isItem, idx) => {
          const endDate = isItem?.endDate ? new Date(isItem.endDate) : null;
          const year = endDate ? `FY${String(endDate.getFullYear()).slice(-2)}` : `FY${4 - idx}`;
          const revM = toMillions(isItem.totalRevenue);
          const gpM = toMillions(isItem.grossProfit);
          const ebitdaM = toMillions(isItem.ebitda ?? 0);
          const niM = toMillions(isItem.netIncome);
          const epsY = toNumber(isItem.dilutedEPS ?? isItem.basicEPS);
          // match closest cashflow by date
          let cfMatch = null;
          let minDelta = Number.POSITIVE_INFINITY;
          for (const cf of cashflowHistoryArr) {
            if (!cf?.endDate) continue;
            const delta = Math.abs(new Date(cf.endDate) - (endDate || new Date(cf.endDate)));
            if (delta < minDelta) { minDelta = delta; cfMatch = cf; }
          }
          const ocfM = toMillions(cfMatch?.totalCashFromOperatingActivities ?? cfMatch?.operatingCashflow);
          const capexM = toMillions(cfMatch?.capitalExpenditures);
          const fcfM = (ocfM ?? 0) + (capexM ?? 0);
          const revenueGrowth = prevRevM ? ((revM - prevRevM) / prevRevM) * 100 : 0;
          prevRevM = revM || prevRevM;
          const grossMargin = revM ? (gpM / revM) * 100 : 0;
          const ebitdaMargin = revM ? (ebitdaM / revM) * 100 : 0;
          const netIncomeMargin = revM ? (niM / revM) * 100 : 0;
          const fcfMargin = revM ? (fcfM / revM) * 100 : 0;
          historical_financials.push({
            year,
            revenue: revM || 0,
            revenueGrowth,
            grossProfit: gpM || 0,
            grossMargin,
            ebitda: ebitdaM || 0,
            ebitdaMargin,
            fcf: fcfM || 0,
            fcfMargin,
            netIncome: niM || 0,
            netIncomeMargin,
            eps: epsY || 0,
          });
        });

        result = {
          fy24_financials,
          market_data: {
            current_price: toNumber(price.regularMarketPrice ?? financialData.currentPrice),
            market_cap: toNumber(price.marketCap),
            enterprise_value: toNumber(summaryDetail.enterpriseValue ?? keyStats.enterpriseValue),
            pe_ratio: toNumber(summaryDetail.trailingPE ?? keyStats.trailingPE),
          },
          company_name: price.longName || price.shortName || ticker,
          source: 'yahoo-finance2-fallback',
          currency_info: {
            original_currency: price.currency || 'USD',
            converted_to_usd: false,
            conversion_rate: 1,
            exchange_rate_source: 'none'
          },
          historical_financials,
        };
      } catch (fbErr) {
        console.error('Fallback yahoo-finance2 failed:', fbErr?.message);
        return NextResponse.json({ error: 'Failed to fetch yfinance data' }, { status: 500 });
      }
    }

    // Add 5y daily price series via yahoo-finance2 chart() only (safe for prices)
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
    } catch (e) {
      console.warn('Failed to attach historical price series via chart():', e?.message);
      result.historicalData = [];
      result.dataPoints = 0;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in yfinance-data route:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
