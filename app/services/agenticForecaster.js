/**
 * AgenticForecaster - Multi-step agentic research workflow for financial analysis
 * 
 * Uses Anthropic Claude with web_search tool to:
 * Step 1: Initial Analysis - Analyze data, identify gaps, create research plan
 * Step 2: Web Research - 3-5 targeted web searches based on research plan
 * Step 3: Draft Forecast - Synthesize research into projections
 * Step 4: Validation - Self-check assumptions, assign confidence scores
 */

import Anthropic from '@anthropic-ai/sdk';

// Pricing per million tokens (Claude Haiku 3.5 - much cheaper than Sonnet)
const PRICING = {
    input: 0.80 / 1_000_000,
    output: 4.00 / 1_000_000,
    webSearchPerRequest: 0.01 // Approximate cost per web search
};

/**
 * @typedef {Object} AgenticStep
 * @property {'analysis' | 'research' | 'forecast' | 'validation'} step
 * @property {string} input - Prompt sent to Claude
 * @property {any} output - Parsed response
 * @property {Object} metadata
 * @property {number} metadata.tokens_used
 * @property {string[]} [metadata.sources]
 * @property {'high' | 'medium' | 'low'} [metadata.confidence]
 * @property {number} metadata.duration_ms
 */

/**
 * @typedef {Object} AgenticForecastResult
 * @property {Object} forecast - Same schema as current forecasts
 * @property {AgenticStep[]} research_trail
 * @property {number} total_cost
 * @property {number} total_time_seconds
 * @property {Object} confidence_scores
 */

export class AgenticForecaster {
    constructor(apiKey) {
        this.client = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY
        });
        this.conversationHistory = [];
        this.researchTrail = [];
        this.totalTokens = { input: 0, output: 0 };
        this.webSearchCount = 0;
        this.startTime = null;
        this.maxLLMCalls = 6; // Reduced for Vercel 60s limit
        this.llmCallCount = 0;
        this.timeoutMs = 60000; // 60 second timeout per API call (Vercel Pro)
    }

    /**
     * Calculate estimated cost based on token usage
     */
    calculateCost() {
        return (
            this.totalTokens.input * PRICING.input +
            this.totalTokens.output * PRICING.output +
            this.webSearchCount * PRICING.webSearchPerRequest
        );
    }

    /**
     * Make a Claude API call with optional web_search tool
     */
    async callClaude(systemPrompt, userMessage, enableWebSearch = false, stepName = 'unknown') {
        if (this.llmCallCount >= this.maxLLMCalls) {
            throw new Error(`Rate limit reached: max ${this.maxLLMCalls} LLM calls per forecast`);
        }

        this.llmCallCount++;
        const stepStart = Date.now();

        // Add user message to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        const tools = enableWebSearch ? [{
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 2 // Reduced for speed
        }] : [];

        try {
            // Direct API call - Vercel Pro handles 300s overall timeout
            // Using Claude Haiku for cost efficiency (~10x cheaper than Sonnet)
            const response = await this.client.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 4096,
                system: systemPrompt,
                messages: this.conversationHistory,
                tools: tools.length > 0 ? tools : undefined
            });

            // Track token usage
            this.totalTokens.input += response.usage?.input_tokens || 0;
            this.totalTokens.output += response.usage?.output_tokens || 0;

            // Extract text content and web search results
            let textContent = '';
            let sources = [];

            for (const block of response.content) {
                if (block.type === 'text') {
                    textContent += block.text;
                } else if (block.type === 'web_search_tool_result') {
                    this.webSearchCount++;
                    // Extract sources from web search results
                    if (block.content && Array.isArray(block.content)) {
                        for (const result of block.content) {
                            if (result.type === 'web_search_result' && result.url) {
                                sources.push(result.url);
                            }
                        }
                    }
                }
            }

            // Add assistant response to conversation history
            this.conversationHistory.push({
                role: 'assistant',
                content: response.content
            });

            const duration = Date.now() - stepStart;

            return {
                text: textContent,
                sources,
                tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
                duration
            };
        } catch (error) {
            console.error(`[AgenticForecaster] Error in ${stepName}:`, error.message);
            throw error;
        }
    }

    /**
     * Step 1: Initial Data Analysis
     * Analyze historical data and create a research plan
     */
    async step1_initialAnalysis(ticker, companyData, sonarInsights) {
        const systemPrompt = `You are a senior financial analyst creating a research plan for ${ticker}. 
Be specific and actionable. Focus on identifying information gaps and key assumptions that need validation.`;

        const revenue = companyData?.fy24_financials?.revenue || 0;
        const grossMargin = companyData?.fy24_financials?.gross_margin_pct || 0;
        const currentPrice = companyData?.market_data?.current_price || 0;
        const historicalData = companyData?.historical_financials || [];

        const userMessage = `Analyze ${ticker} (${companyData?.company_name || ticker}) for a 5-year financial forecast.

CURRENT DATA:
- Revenue: $${(revenue / 1_000_000).toFixed(0)}M
- Gross Margin: ${grossMargin.toFixed(1)}%
- Current Price: $${currentPrice.toFixed(2)}
- Historical Years Available: ${historicalData.length}

EXISTING INSIGHTS:
${sonarInsights || 'No prior insights available'}

Create a focused research plan. Output JSON:
{
  "data_quality_issues": ["list any gaps or concerns"],
  "key_assumptions": ["3-5 critical assumptions for this forecast"],
  "research_questions": [
    {"question": "specific search query", "priority": "high/medium", "rationale": "why this matters"}
  ],
  "metrics_to_focus": ["which financial metrics matter most for this company"]
}`;

        const result = await this.callClaude(systemPrompt, userMessage, false, 'analysis');

        // Parse JSON from response
        let parsed = {};
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('[AgenticForecaster] Failed to parse analysis JSON, using raw text');
            parsed = { research_questions: [], raw_analysis: result.text };
        }

        this.researchTrail.push({
            step: 'analysis',
            input: `Analyze ${ticker} data and create research plan`,
            output: parsed,
            metadata: {
                tokens_used: result.tokens,
                duration_ms: result.duration
            }
        });

        return parsed;
    }

    /**
     * Step 2: Targeted Web Research
     * Execute web searches based on research plan
     */
    async step2_webResearch(ticker, researchPlan, companyName) {
        const questions = researchPlan?.research_questions || [];
        // OPTIMIZED: Only 2 research questions max for Vercel 60s limit
        const topQuestions = questions.slice(0, 2);

        const systemPrompt = `You are a financial research analyst for ${companyName} (${ticker}).
Use web_search to find current, credible information. Focus on:
- Official company communications (earnings calls, guidance, IR)
- Analyst reports and estimates
- Industry news and trends
- Regulatory filings

Synthesize findings clearly and note source credibility.`;

        const researchFindings = [];

        for (let i = 0; i < topQuestions.length && this.llmCallCount < this.maxLLMCalls - 2; i++) {
            const q = topQuestions[i];
            const query = typeof q === 'string' ? q : q.question;

            const userMessage = `Research the following about ${ticker}:
"${query}"

Search for recent, credible sources. Synthesize your findings with specific data points, numbers, and dates when available.`;

            try {
                const result = await this.callClaude(systemPrompt, userMessage, true, `research_${i + 1}`);

                researchFindings.push({
                    query,
                    findings: result.text,
                    sources: result.sources
                });

                this.researchTrail.push({
                    step: 'research',
                    input: query,
                    output: { findings: result.text, sources: result.sources },
                    metadata: {
                        tokens_used: result.tokens,
                        sources: result.sources,
                        duration_ms: result.duration
                    }
                });
            } catch (error) {
                console.log(`[AgenticForecaster] Research query ${i + 1} failed:`, error.message);
                // Continue with remaining queries
            }
        }

        return researchFindings;
    }

    /**
     * Step 3: Draft Forecast Generation
     * Synthesize all research into financial projections
     */
    async step3_draftForecast(ticker, companyData, researchFindings) {
        const systemPrompt = `You are a financial analyst creating a 5-year forecast for ${ticker}.
Base your projections on the research conducted. Be specific about which findings informed each assumption.`;

        // Build research summary
        const researchSummary = researchFindings.map((r, i) =>
            `Research ${i + 1} - "${r.query}":\n${r.findings}\nSources: ${r.sources?.join(', ') || 'N/A'}`
        ).join('\n\n---\n\n');

        const fy = companyData?.fy24_financials || {};
        const historicalData = companyData?.historical_financials || [];

        // Determine latest fiscal year
        let latestFY = 2024;
        if (historicalData.length > 0) {
            const years = historicalData.map(h => {
                const yearStr = String(h.year || h.fiscal_year || '');
                const match = yearStr.match(/(\d{2,4})/);
                if (match) {
                    let yr = parseInt(match[1], 10);
                    if (yr < 100) yr = 2000 + yr;
                    return yr;
                }
                return null;
            }).filter(y => y && y > 2000);
            if (years.length > 0) latestFY = Math.max(...years);
        }

        const forecastStart = latestFY + 1;
        const forecastEnd = forecastStart + 4;

        const userMessage = `Based on all research conducted, generate a ${forecastStart}-${forecastEnd} forecast for ${ticker}.

LATEST ACTUAL DATA (FY${latestFY}):
- Revenue: $${((fy.revenue || 0) / 1_000_000).toFixed(0)}M
- Gross Margin: ${(fy.gross_margin_pct || 0).toFixed(1)}%
- EBITDA: $${((fy.ebitda || 0) / 1_000_000).toFixed(0)}M
- Net Income: $${((fy.net_income || 0) / 1_000_000).toFixed(0)}M
- EPS: $${(fy.eps || 0).toFixed(2)}

RESEARCH FINDINGS:
${researchSummary}

Generate your forecast as JSON:
{
  "projections": [
    {
      "year": "${forecastStart}",
      "revenue": <number in millions>,
      "revenueGrowth": <percentage>,
      "grossMargin": <percentage>,
      "ebitdaMargin": <percentage>,
      "fcfMargin": <percentage>,
      "netIncome": <number in millions>,
      "eps": <number>
    }
    // ... for each year through ${forecastEnd}
  ],
  "fair_value_per_share": <number>,
  "exit_multiple_type": "P/E or EV/EBITDA or EV/FCF",
  "exit_multiple_value": <number>,
  "key_assumptions": [
    {"assumption": "description", "source": "which research informed this"}
  ]
}`;

        const result = await this.callClaude(systemPrompt, userMessage, false, 'forecast');

        let parsed = {};
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('[AgenticForecaster] Failed to parse forecast JSON');
            parsed = { raw_forecast: result.text };
        }

        this.researchTrail.push({
            step: 'forecast',
            input: 'Generate 5-year forecast based on research',
            output: parsed,
            metadata: {
                tokens_used: result.tokens,
                duration_ms: result.duration
            }
        });

        return parsed;
    }

    /**
     * Step 4: Self-Validation
     * Check forecast for consistency and assign confidence scores
     */
    async step4_validation(ticker, draftForecast, companyData) {
        const systemPrompt = `You are a senior financial analyst reviewing a forecast for internal consistency and reasonableness.
Be critical but fair. Check for logical inconsistencies, unrealistic assumptions, and compare to industry benchmarks.`;

        const userMessage = `Review this forecast for ${ticker}:

${JSON.stringify(draftForecast, null, 2)}

Validate:
1. Do margin assumptions align with the revenue growth story?
2. Are competitive dynamics properly reflected?
3. Do numbers pass industry benchmark sanity checks?
4. Are any growth rates unrealistic (>50% without strong justification)?

Output JSON:
{
  "validation_passed": true/false,
  "confidence_scores": {
    "revenue": "high/medium/low",
    "margins": "high/medium/low",
    "fcf": "high/medium/low"
  },
  "issues_found": ["list any problems"],
  "suggestions": ["improvements if confidence is low"],
  "needs_more_research": false,
  "additional_research_needed": ["queries if needs_more_research is true"]
}`;

        const result = await this.callClaude(systemPrompt, userMessage, false, 'validation');

        let parsed = {};
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.log('[AgenticForecaster] Failed to parse validation JSON');
            parsed = {
                validation_passed: true,
                confidence_scores: { revenue: 'medium', margins: 'medium', fcf: 'medium' },
                raw_validation: result.text
            };
        }

        this.researchTrail.push({
            step: 'validation',
            input: 'Validate forecast consistency and assign confidence',
            output: parsed,
            metadata: {
                tokens_used: result.tokens,
                confidence: parsed.confidence_scores?.revenue || 'medium',
                duration_ms: result.duration
            }
        });

        return parsed;
    }

    /**
     * Main entry point - orchestrate the full agentic workflow
     */
    async generateForecast(ticker, companyData, sonarInsights) {
        this.startTime = Date.now();
        this.conversationHistory = [];
        this.researchTrail = [];
        this.totalTokens = { input: 0, output: 0 };
        this.webSearchCount = 0;
        this.llmCallCount = 0;

        console.log(`[AgenticForecaster] Starting agentic forecast for ${ticker}`);

        try {
            // Step 1: Initial Analysis
            console.log('[AgenticForecaster] Step 1: Initial Analysis');
            const researchPlan = await this.step1_initialAnalysis(ticker, companyData, sonarInsights);

            // Step 2: Web Research
            console.log('[AgenticForecaster] Step 2: Web Research');
            const researchFindings = await this.step2_webResearch(
                ticker,
                researchPlan,
                companyData?.company_name || ticker
            );

            // Step 3: Draft Forecast
            console.log('[AgenticForecaster] Step 3: Draft Forecast');
            const draftForecast = await this.step3_draftForecast(ticker, companyData, researchFindings);

            // Step 4: Validation
            console.log('[AgenticForecaster] Step 4: Validation');
            const validation = await this.step4_validation(ticker, draftForecast, companyData);

            // If validation suggests more research needed and we have budget, do one more research round
            if (validation.needs_more_research &&
                validation.additional_research_needed?.length > 0 &&
                this.llmCallCount < this.maxLLMCalls - 2) {
                console.log('[AgenticForecaster] Additional research triggered by validation');
                const additionalResearch = await this.step2_webResearch(
                    ticker,
                    { research_questions: validation.additional_research_needed.slice(0, 2) },
                    companyData?.company_name || ticker
                );
                // Could re-generate forecast here if needed
            }

            const totalTime = (Date.now() - this.startTime) / 1000;
            const totalCost = this.calculateCost();

            console.log(`[AgenticForecaster] Complete: ${totalTime.toFixed(1)}s, $${totalCost.toFixed(4)}, ${this.llmCallCount} LLM calls, ${this.webSearchCount} web searches`);

            // Get market data
            const currentPrice = companyData?.market_data?.current_price || 0;
            const sharesOutstanding = companyData?.fy24_financials?.shares_outstanding ||
                companyData?.market_data?.shares_outstanding || 1;

            // Get projections and find terminal year data
            const projections = draftForecast.projections || [];
            const terminalYear = projections[projections.length - 1] || {};

            // Get exit multiple info
            const exitMultipleType = draftForecast.exit_multiple_type || 'P/E';
            const exitMultipleValue = draftForecast.exit_multiple_value || 20;

            // Calculate terminal values based on multiple type
            const terminalRevenue = Number(terminalYear.revenue || 0) * 1_000_000; // Convert from millions
            const terminalEbitda = terminalRevenue * (Number(terminalYear.ebitdaMargin || 0) / 100);
            const terminalFcf = terminalRevenue * (Number(terminalYear.fcfMargin || 0) / 100);
            const terminalNetIncome = Number(terminalYear.netIncome || 0) * 1_000_000;
            const terminalEps = Number(terminalYear.eps || 0);

            // Calculate enterprise/equity value based on multiple type
            let calculatedValue = 0;
            let calculationMethod = '';
            let metricUsed = 0;

            if (exitMultipleType === 'P/E' || exitMultipleType === 'PE') {
                // P/E uses equity value directly
                if (terminalEps > 0) {
                    calculatedValue = terminalEps * exitMultipleValue;
                    metricUsed = terminalEps;
                    calculationMethod = `${terminalEps.toFixed(2)} EPS × ${exitMultipleValue}x P/E`;
                } else if (terminalNetIncome > 0 && sharesOutstanding > 0) {
                    const impliedEps = terminalNetIncome / sharesOutstanding;
                    calculatedValue = impliedEps * exitMultipleValue;
                    metricUsed = impliedEps;
                    calculationMethod = `$${(impliedEps).toFixed(2)} EPS × ${exitMultipleValue}x P/E`;
                }
            } else if (exitMultipleType === 'EV/EBITDA') {
                // EV/EBITDA: Enterprise Value / EBITDA
                const enterpriseValue = terminalEbitda * exitMultipleValue;
                const netDebt = companyData?.market_data?.net_debt || 0;
                const equityValue = enterpriseValue - netDebt;
                calculatedValue = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
                metricUsed = terminalEbitda / 1_000_000; // Back to millions for display
                calculationMethod = `$${(terminalEbitda / 1_000_000).toFixed(0)}M EBITDA × ${exitMultipleValue}x = $${(enterpriseValue / 1_000_000).toFixed(0)}M EV`;
            } else if (exitMultipleType === 'EV/FCF') {
                // EV/FCF: Enterprise Value / Free Cash Flow
                const enterpriseValue = terminalFcf * exitMultipleValue;
                const netDebt = companyData?.market_data?.net_debt || 0;
                const equityValue = enterpriseValue - netDebt;
                calculatedValue = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
                metricUsed = terminalFcf / 1_000_000;
                calculationMethod = `$${(terminalFcf / 1_000_000).toFixed(0)}M FCF × ${exitMultipleValue}x = $${(enterpriseValue / 1_000_000).toFixed(0)}M EV`;
            }

            // Fallback to LLM's fair value if calculation failed
            const fairValue = calculatedValue > 0 ? calculatedValue : (draftForecast.fair_value_per_share || 0);
            const upside = currentPrice > 0 && fairValue > 0
                ? ((fairValue - currentPrice) / currentPrice) * 100
                : 0;

            // Build calculation breakdown for frontend
            const exitMultipleCalculation = {
                terminalYear: terminalYear.year || 'FY30',
                terminalRevenue: terminalRevenue / 1_000_000,
                terminalEbitda: terminalEbitda / 1_000_000,
                terminalFcf: terminalFcf / 1_000_000,
                terminalNetIncome: terminalNetIncome / 1_000_000,
                terminalEps: terminalEps,
                exitMultipleType,
                exitMultipleValue,
                metricUsed,
                calculationMethod,
                fairValue,
                currentPrice,
                upside,
                sharesOutstanding
            };

            return {
                // Standard forecast fields (compatible with existing UI)
                companyName: companyData?.company_name || ticker,
                method: 'agentic',
                fairValue: fairValue,
                currentSharePrice: currentPrice,
                exitMultipleType: exitMultipleType,
                exitMultipleValue: exitMultipleValue,
                upside: upside,
                cagr: fairValue > 0 && currentPrice > 0
                    ? (Math.pow(fairValue / currentPrice, 1 / 5) - 1) * 100
                    : 0,
                projections: projections,
                historicalFinancials: companyData?.historical_financials || [],
                latestDevelopments: this.researchTrail
                    .filter(s => s.step === 'research')
                    .map(s => s.output?.findings || '')
                    .join('\n\n'),

                // Calculation breakdown
                exitMultipleCalculation: exitMultipleCalculation,

                // Agentic-specific fields
                research_trail: this.researchTrail,
                total_cost: totalCost,
                total_time_seconds: totalTime,
                confidence_scores: validation.confidence_scores || {
                    revenue: 'medium',
                    margins: 'medium',
                    fcf: 'medium'
                },
                key_assumptions: draftForecast.key_assumptions || [],
                validation_issues: validation.issues_found || [],
                llm_calls: this.llmCallCount,
                web_searches: this.webSearchCount,
                source: 'agentic'
            };

        } catch (error) {
            console.error('[AgenticForecaster] Error:', error.message);
            throw error;
        }
    }
}

export default AgenticForecaster;
