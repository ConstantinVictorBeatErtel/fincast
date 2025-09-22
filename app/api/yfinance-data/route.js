import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

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

    // If still no result, return explicit failure without LLM/heuristics
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
