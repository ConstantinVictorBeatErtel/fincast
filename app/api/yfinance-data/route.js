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



export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const includePrices = searchParams.get('prices') === '1';
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
    }

    console.log(`Fetching yfinance data for ${ticker}...`);

    // Try different Python paths for Vercel vs local
    const isVercel = !!process.env.VERCEL_URL || process.env.VERCEL === '1';
    let pythonCmd, scriptPath, cmd, args;
    
    if (isVercel) {
      // On Vercel, try different Python paths
      pythonCmd = 'python3'; // Vercel should have python3 in PATH
      scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;
      cmd = pythonCmd;
      args = [scriptPath, ticker];
    } else {
      // Local development
      pythonCmd = `${process.cwd()}/venv/bin/python3`;
      scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;
      const isDarwin = process.platform === 'darwin';
      const isNodeRosetta = process.arch === 'x64';
      cmd = isDarwin && isNodeRosetta ? '/usr/bin/arch' : pythonCmd;
      args = isDarwin && isNodeRosetta ? ['-arm64', pythonCmd, scriptPath, ticker] : [scriptPath, ticker];
    }

    const runLocalPython = async () => new Promise((resolve) => {
      console.log(`Running Python script: ${cmd} ${args.join(' ')}`);
      console.log(`Working directory: ${process.cwd()}`);
      console.log(`Script exists: ${require('fs').existsSync(scriptPath)}`);
      
      const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        console.log(`Python script exit code: ${code}`);
        console.log(`Python stdout: ${stdout.substring(0, 500)}`);
        console.log(`Python stderr: ${stderr.substring(0, 500)}`);
        
        if (code !== 0) {
          console.error('Python yfinance script exited non-zero:', code, stderr);
          return resolve(null);
        }
        try {
          const json = JSON.parse(stdout);
          console.log('Python script returned valid JSON');
          resolve(json);
        } catch (e) {
          console.error('Failed to parse python output:', e);
          console.error('Raw stdout:', stdout);
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
        
        // Check if this is an internal call (same route) and handle it directly
        try {
          const ext = new URL(url);
          const reqHost = request.headers.get('x-vercel-deployment-url') || request.headers.get('host');
          const sameHost = reqHost && (ext.host === reqHost || ext.host === reqHost?.replace(/^https?:\/\//, ''));
          const samePath = /\/api\/yfinance-data\/?$/.test(ext.pathname);
          
          if (sameHost && samePath) {
            console.log('PY_YF_URL points to this same route - handling internally to avoid recursion');
            // This is an internal call, run the Python script directly
            result = await runLocalPython();
            if (result) {
              console.log('Using internal Python script result (prod)');
            }
          } else {
            // External call with authentication bypass headers
            const headers = { 'Content-Type': 'application/json' };
            if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
              headers['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
            }
            if (process.env.VERCEL_PROTECTION_BYPASS) {
              headers['x-vercel-protection-bypass'] = process.env.VERCEL_PROTECTION_BYPASS;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
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
          }
        } catch (parseError) {
          console.warn('Could not parse PY_YF_URL for recursion check:', parseError.message);
          // Fallback to external call
          const headers = { 'Content-Type': 'application/json' };
          if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            headers['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
          }
          if (process.env.VERCEL_PROTECTION_BYPASS) {
            headers['x-vercel-protection-bypass'] = process.env.VERCEL_PROTECTION_BYPASS;
          }
          
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
          clearTimeout(timeout);
          if (response.ok) {
            const json = await response.json();
            if (json && Array.isArray(json.historical_financials) && json.historical_financials.length > 0) {
              result = json;
              console.log('Using external PY_YF_URL result (prod fallback)');
            }
          }
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

    // If still no result, return explicit failure (no fallback as requested by user)
    if (!result) {
      return NextResponse.json({ error: 'Python yfinance API failed. No fallback available.' }, { status: 500 });
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
