import { spawn } from 'child_process';
import fs from 'fs';

const dataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchForecastData(ticker, headers = {}) {
    const cacheKey = `${ticker}-${Math.floor(Date.now() / CACHE_TTL)}`;

    if (dataCache.has(cacheKey)) {
        console.log(`[DataFetcher] Using cached data for ${ticker}`);
        return dataCache.get(cacheKey);
    }

    try {
        console.log(`[DataFetcher] Fetching fresh data for ${ticker}...`);
        // Fetch all data in parallel
        const [yfinance, sonar] = await Promise.all([
            fetchYFinanceData(ticker, headers),
            fetchPerplexitySonar(ticker).catch(err => {
                console.warn('[DataFetcher] Sonar fetch failed, using fallback:', err);
                return { summary: 'Not available', insights: [] };
            })
        ]);

        // YFinance data contains historical_financials, fy24_financials, market_data etc.
        // We restructure it slightly to match the expected format for validation

        const normalizeToMillions = (val) => val ? val / 1e6 : 0;
        const rawRev = yfinance?.ttm_financials?.revenue || yfinance?.fy24_financials?.revenue;
        const rawEbitda = yfinance?.ttm_financials?.ebitda || yfinance?.fy24_financials?.ebitda;
        const rawNi = yfinance?.ttm_financials?.net_income || yfinance?.fy24_financials?.net_income;
        const rawFcf = yfinance?.ttm_financials?.fcf || yfinance?.fy24_financials?.fcf;
        const rawMCap = yfinance?.market_data?.market_cap;
        // Enterprise Value usually in absolute too

        const consolidatedData = {
            yfinanceData: {
                ...yfinance?.fy24_financials,
                ...yfinance?.market_data,
                // Normalize strict financial values to Millions to match Historical Data units
                revenue: normalizeToMillions(rawRev),
                grossMargin: yfinance?.financials?.grossMargin || yfinance?.ttm_financials?.gross_margin_pct,
                ebitda: normalizeToMillions(rawEbitda),
                ebitdaMargin: yfinance?.financials?.ebitdaMargin,
                netIncome: normalizeToMillions(rawNi),
                netIncomeMargin: yfinance?.financials?.netIncomeMargin,
                eps: yfinance?.ttm_financials?.eps || yfinance?.fy24_financials?.eps,
                currentPrice: yfinance?.market_data?.current_price,
                marketCap: normalizeToMillions(rawMCap),
                enterpriseValue: normalizeToMillions(yfinance?.market_data?.enterprise_value),
                peRatio: yfinance?.market_data?.pe_ratio,
                psRatio: yfinance?.financials?.psRatio,
                evEbitda: yfinance?.financials?.evEbitda,
                evFcf: yfinance?.financials?.evFcf,
                roic: yfinance?.financials?.roic,
                fcfYield: yfinance?.financials?.fcfYield,
                freeCashFlow: normalizeToMillions(rawFcf),
                fiscalInfo: yfinance?.fiscal_info,
                // Keep raw values for reference if needed?
                _rawRevenue: rawRev
            },
            sonarData: sonar,
            historicalData: yfinance?.historical_financials || [],
            valuationHistory: yfinance?.valuationHistory || [],
            rawYf: yfinance
        };

        // Validate data quality
        const validation = validateDataQuality(consolidatedData);

        const result = {
            ...consolidatedData,
            dataQuality: validation,
            timestamp: new Date().toISOString()
        };

        dataCache.set(cacheKey, result);
        return result;

    } catch (error) {
        console.error('[DataFetcher] Error:', error);
        throw new Error(`Failed to fetch data for ${ticker}: ${error.message}`);
    }
}

function validateDataQuality(data) {
    const issues = [];
    let score = 100;

    // Check yfinance data
    if (!data.yfinanceData.revenue || data.yfinanceData.revenue === 0) {
        issues.push('Missing or zero revenue data');
        score -= 30;
    }

    if (!data.yfinanceData.ebitda) {
        issues.push('Missing EBITDA data');
        score -= 20;
    }

    // Check historical data
    if (!data.historicalData || data.historicalData.length < 3) {
        issues.push('Insufficient historical data (need 3+ years)');
        score -= 25;
    }

    // Check Sonar data
    if (!data.sonarData || (!data.sonarData.full_response && !data.sonarData.summary)) {
        issues.push('No recent market insights available');
        score -= 15;
    }

    return {
        score: Math.max(0, score),
        issues,
        isReliable: score >= 70
    };
}

// Helper to run python script with mode
// Helper to run python script via Spawn (Local) or HTTP (Vercel)
async function runPythonScript(ticker, mode, headers = {}) {
    const isVercel = !!process.env.VERCEL_URL || process.env.VERCEL === '1';

    // STRATEGY: On Vercel, Node and Python run in separate isolated environments.
    // We cannot spawn python3 from Node. We MUST call the Python Serverless Function via HTTP.

    if (isVercel) {
        try {
            const baseUrl = `https://${process.env.VERCEL_URL}`;
            const url = new URL('/api/py-yf', baseUrl);
            url.searchParams.set('ticker', ticker);
            if (mode) url.searchParams.set('mode', mode.replace('--', '')); // API expects 'valuation' not '--valuation'

            console.log(`[DataFetcher] Calling Python Function via HTTP: ${url.toString()}`);

            // Forward headers (cookies) to pass Vercel Authentication on Preview deployments
            const requestHeaders = {
                'Content-Type': 'application/json',
                ...headers // Specific headers like 'cookie' or 'authorization'
            };

            const res = await fetch(url.toString(), {
                method: 'GET',
                headers: requestHeaders
            });

            if (!res.ok) {
                const txt = await res.text();
                console.error(`[DataFetcher] Python API Error (${res.status}): ${txt}`);
                return null;
            }

            return await res.json();
        } catch (e) {
            console.error(`[DataFetcher] HTTP Fetch Error: ${e.message}`);
            return null;
        }
    }

    // LOCAL DEVELOPMENT: Spawn process as usual
    let pythonCmd, scriptPath, cmd, args;

    // Local development configuration
    pythonCmd = `${process.cwd()}/venv/bin/python3`;
    scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;
    const isDarwin = process.platform === 'darwin';
    const isNodeRosetta = process.arch === 'x64';
    cmd = isDarwin && isNodeRosetta ? '/usr/bin/arch' : pythonCmd;
    args = isDarwin && isNodeRosetta ? ['-arm64', pythonCmd, scriptPath, ticker] : [scriptPath, ticker];
    if (mode && isDarwin && isNodeRosetta) {
        args.push(mode);
    } else if (mode) {
        args.push(mode);
    }

    return new Promise((resolve, reject) => {
        try {
            console.log(`[DataFetcher] Running Python script (${mode || 'standard'}): ${cmd} ${args.join(' ')}`);
            if (!fs.existsSync(scriptPath)) {
                return reject(new Error(`Script not found at ${scriptPath}`));
            }

            const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('close', (code) => {
                if (code !== 0) {
                    console.error(`[DataFetcher] Python script stderr (${mode}): ${stderr}`);
                    return resolve(null);
                }
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    console.error(`[DataFetcher] JSON parse error (${mode}): ${e.message}`);
                    resolve(null);
                }
            });
            child.on('error', (err) => {
                console.error(`[DataFetcher] Spawn error: ${err.message}`);
                resolve(null);
            });
        } catch (e) {
            console.error(`[DataFetcher] Setup error: ${e.message}`);
            resolve(null);
        }
    });
}

// Fetch both standard and valuation data
async function fetchYFinanceData(ticker, headers = {}) {
    const [standard, valuation] = await Promise.all([
        runPythonScript(ticker, null, headers),
        runPythonScript(ticker, '--valuation', headers)
    ]);

    if (!standard) return null;

    // Attach valuation history to standard response
    if (valuation && Array.isArray(valuation)) {
        standard.valuationHistory = valuation;
    }

    return standard;
}

async function fetchPerplexitySonar(ticker) {
    if (!process.env.OPENROUTER_API_KEY) return null;

    const messages = [
        { role: 'system', content: 'Return ONLY JSON. Be concise. Use official IR and SEC sources.' },
        { role: 'user', content: `Find the most recently reported quarter for ${ticker} (as filed or disclosed by the company) AND analyst consensus estimates for the next 2-3 years. Return EXACT JSON with: as_of_date, latest_quarter, latest_quarter_revenue, latest_quarter_gross_margin_pct, latest_quarter_ebitda_margin_pct, latest_quarter_net_income, consensus_revenue_next_year, consensus_eps_next_year, guidance_summary, mgmt_summary, recent_developments, links { ir_url, sec_url }.` }
    ];

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.VERCEL_URL || 'http://localhost:3000',
                'X-Title': 'Fincast'
            },
            body: JSON.stringify({
                model: 'perplexity/sonar',
                messages,
                temperature: 0.3,
                max_tokens: 800
            })
        });

        if (!response.ok) throw new Error(`Sonar API failed: ${response.status}`);
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content || '';

        let sonarData = {};
        try {
            sonarData = JSON.parse(text);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) sonarData = JSON.parse(m[0]);
        }

        // Construct summary for downstream use
        const full = `Latest quarterly data for ${ticker}:
- Management: ${sonarData.mgmt_summary || ''}
- Guidance: ${sonarData.guidance_summary || ''}
- Recent Developments: ${sonarData.recent_developments || ''}`;

        return { ...sonarData, full_response: full, summary: full };
    } catch (e) {
        console.error('[DataFetcher] Sonar error:', e);
        return null;
    }
}
