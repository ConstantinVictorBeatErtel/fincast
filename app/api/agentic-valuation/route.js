import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';
import { AgenticForecaster } from '@/app/services/agenticForecaster';

export const dynamic = 'force-dynamic';

// Extended timeout for agentic workflow (up to 60 seconds)
export const maxDuration = 60;

/**
 * Fetch yfinance data - reusing logic from dcf-valuation route
 */
async function fetchYFinanceData(ticker) {
    const isVercel = !!process.env.VERCEL_URL || process.env.VERCEL === '1';

    if (!isVercel) {
        // Local development: spawn Python script directly
        try {
            console.log(`[Agentic] Fetching yfinance data for ${ticker}`);
            const scriptPath = `${process.cwd()}/scripts/fetch_yfinance.py`;
            const pythonCmd = `${process.cwd()}/venv/bin/python3`;
            const isDarwin = process.platform === 'darwin';
            const isNodeRosetta = process.arch === 'x64';
            const cmd = isDarwin && isNodeRosetta ? '/usr/bin/arch' : pythonCmd;
            const args = isDarwin && isNodeRosetta ? ['-arm64', pythonCmd, scriptPath, ticker] : [scriptPath, ticker];

            const py = await new Promise((resolve) => {
                try {
                    const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
                    let stdout = '';
                    let stderr = '';
                    child.stdout.on('data', (d) => { stdout += d.toString(); });
                    child.stderr.on('data', (d) => { stderr += d.toString(); });
                    child.on('close', (code) => {
                        if (code !== 0) {
                            console.log(`[Agentic] Python exit ${code}: ${stderr.substring(0, 200)}`);
                            return resolve(null);
                        }
                        try {
                            resolve(JSON.parse(stdout));
                        } catch (e) {
                            resolve(null);
                        }
                    });
                    child.on('error', () => resolve(null));
                } catch (e) {
                    resolve(null);
                }
            });

            if (py && Array.isArray(py.historical_financials) && py.historical_financials.length > 0) {
                return py;
            }
        } catch (e) {
            console.log(`[Agentic] Python script error: ${e.message}`);
        }
    } else {
        // Vercel: call Python API
        try {
            const pyYfUrl = process.env.PY_YF_URL;
            const baseUrl = pyYfUrl
                ? pyYfUrl.replace(/\?.*$/, '')
                : `https://${process.env.VERCEL_URL}/api/py-yf`;
            const url = `${baseUrl}?ticker=${encodeURIComponent(ticker)}`;

            const headers = { 'Content-Type': 'application/json' };
            if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
                headers['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (data && Array.isArray(data.historical_financials) && data.historical_financials.length > 0) {
                    return data;
                }
            }
        } catch (e) {
            console.log(`[Agentic] Python API error: ${e.message}`);
        }
    }

    // Fallback to yahoo-finance2
    try {
        const quoteSummary = await yahooFinance.quoteSummary(ticker, {
            modules: ['financialData', 'incomeStatementHistory', 'incomeStatementHistoryQuarterly',
                'balanceSheetHistory', 'cashflowStatementHistory', 'defaultKeyStatistics',
                'summaryDetail', 'price']
        });

        if (!quoteSummary) return null;

        const price = quoteSummary.price || {};
        const financialData = quoteSummary.financialData || {};
        const defaultKeyStatistics = quoteSummary.defaultKeyStatistics || {};
        const summaryDetail = quoteSummary.summaryDetail || {};
        const incomeHistory = quoteSummary.incomeStatementHistory?.incomeStatementHistory || [];
        const cashflowHistory = quoteSummary.cashflowStatementHistory?.cashflowStatements || [];

        const historical_financials = incomeHistory.map((stmt, idx) => {
            const cashflow = cashflowHistory[idx] || {};
            const endDate = stmt.endDate ? new Date(stmt.endDate) : null;
            return {
                fiscal_year: endDate ? endDate.getFullYear() : null,
                revenue: stmt.totalRevenue || 0,
                gross_profit: stmt.grossProfit || 0,
                operating_income: stmt.operatingIncome || 0,
                net_income: stmt.netIncome || 0,
                ebitda: stmt.ebitda || stmt.operatingIncome || 0,
                free_cash_flow: cashflow.freeCashFlow || 0,
                eps: stmt.netIncome && defaultKeyStatistics.sharesOutstanding
                    ? stmt.netIncome / defaultKeyStatistics.sharesOutstanding : 0
            };
        });

        const latestIncome = incomeHistory[0] || {};
        const latestCashflow = cashflowHistory[0] || {};
        const revenue = latestIncome.totalRevenue || 0;
        const grossProfit = latestIncome.grossProfit || 0;
        const netIncome = latestIncome.netIncome || 0;
        const sharesOutstanding = defaultKeyStatistics.sharesOutstanding || price.sharesOutstanding || 1;

        return {
            company_name: price.longName || price.shortName || ticker,
            source: 'yahoo-finance2-js',
            fy24_financials: {
                revenue,
                gross_profit: grossProfit,
                gross_margin_pct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
                operating_income: latestIncome.operatingIncome || 0,
                net_income: netIncome,
                ebitda: latestIncome.ebitda || financialData.ebitda || 0,
                fcf: latestCashflow.freeCashFlow || financialData.freeCashflow || 0,
                eps: financialData.currentPrice && summaryDetail.trailingPE
                    ? financialData.currentPrice / summaryDetail.trailingPE : (netIncome / sharesOutstanding),
                shares_outstanding: sharesOutstanding
            },
            market_data: {
                current_price: financialData.currentPrice || price.regularMarketPrice || 0,
                market_cap: price.marketCap || 0,
                enterprise_value: defaultKeyStatistics.enterpriseValue || 0,
                pe_ratio: summaryDetail.trailingPE || summaryDetail.forwardPE || 0
            },
            currency_info: {
                original_currency: price.currency || 'USD',
                converted_to_usd: false,
                conversion_rate: 1.0
            },
            historical_financials
        };
    } catch (e) {
        console.log(`[Agentic] JS fallback error: ${e.message}`);
        return null;
    }
}

/**
 * Fetch Sonar insights using OpenRouter (same as existing implementation)
 */
async function fetchSonarInsights(ticker) {
    if (!process.env.OPENROUTER_API_KEY) return null;

    try {
        const referer = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': referer,
                'X-Title': 'Fincast Agentic'
            },
            body: JSON.stringify({
                model: 'perplexity/sonar',
                messages: [
                    { role: 'system', content: 'Return concise financial insights as JSON.' },
                    { role: 'user', content: `Provide latest financial insights for ${ticker}: guidance, recent developments, growth catalysts, analyst expectations. Output JSON with keys: guidance_summary, recent_developments, growth_catalysts, analyst_expectations.` }
                ],
                temperature: 0.3,
                max_tokens: 1500
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (e) {
        console.log(`[Agentic] Sonar error: ${e.message}`);
        return null;
    }
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const ticker = searchParams.get('ticker');

        if (!ticker) {
            return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
        }

        // Check for Anthropic API key
        if (!process.env.ANTHROPIC_API_KEY) {
            return NextResponse.json({
                error: 'ANTHROPIC_API_KEY not configured. Agentic mode requires Anthropic API access.',
                fallback_available: true
            }, { status: 500 });
        }

        console.log(`[Agentic] Starting agentic valuation for ${ticker}`);

        // Fetch base data
        const [yf, sonarInsights] = await Promise.all([
            fetchYFinanceData(ticker),
            fetchSonarInsights(ticker)
        ]);

        if (!yf) {
            console.log('[Agentic] No yfinance data, creating minimal structure');
        }

        const companyData = yf || {
            fy24_financials: {},
            market_data: {},
            company_name: ticker,
            source: 'minimal',
            historical_financials: []
        };

        // Run agentic workflow
        const forecaster = new AgenticForecaster();
        const result = await forecaster.generateForecast(ticker, companyData, sonarInsights);

        return NextResponse.json(result);

    } catch (error) {
        console.error('[Agentic] Error:', error);
        return NextResponse.json({
            error: `Agentic forecast failed: ${error?.message || 'unknown error'}`,
            fallback_available: true
        }, { status: 500 });
    }
}

export async function POST(request) {
    // POST with feedback - same as GET but could incorporate user feedback
    return GET(request);
}
