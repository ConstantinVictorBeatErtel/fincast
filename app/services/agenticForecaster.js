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
        this.timeoutMs = 90000; // 90 second timeout per API call (increased for complex DCF prompts)
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
    async step3_draftForecast(ticker, companyData, researchFindings, options = {}) {
        const { method = 'exit-multiple', multipleType = 'auto', feedback = null } = options;

        // Build valuation method instructions
        const isDCF = method === 'dcf';
        const valuationInstructions = isDCF
            ? `Use DISCOUNTED CASH FLOW (DCF) valuation:
- Calculate WACC (use appropriate cost of equity and debt)
- Project Free Cash Flows for each year
- Calculate Terminal Value using a terminal growth rate (2-3%)
- Discount all cash flows back to present value
- Divide total equity value by shares outstanding for fair value per share`
            : `Use EXIT MULTIPLE valuation:
- Apply the specified exit multiple to the terminal year metric
- ${multipleType !== 'auto'
                ? `YOU MUST USE ${multipleType} as the exit multiple type. This is required by the user.`
                : 'Choose the most appropriate multiple (P/E, EV/EBITDA, EV/FCF, or Price/Sales)'}
- Calculate Enterprise Value, then subtract net debt to get Equity Value
- Divide by shares outstanding for fair value per share`;

        // Include user feedback if provided
        const feedbackSection = feedback
            ? `\n\nUSER FEEDBACK (YOU MUST INCORPORATE THIS):\n${feedback}\n\nAdjust your projections and assumptions based on the above feedback.`
            : '';

        const systemPrompt = `You are a financial analyst creating a 5-year forecast for ${ticker}.
Base your projections on the research conducted. Be specific about which findings informed each assumption.

VALUATION METHOD: ${isDCF ? 'Discounted Cash Flow (DCF)' : 'Exit Multiple'}
${valuationInstructions}${feedbackSection}`;

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

        // Get shares outstanding for the prompt
        const sharesOutstanding = companyData?.fy24_financials?.shares_outstanding ||
            companyData?.market_data?.shares_outstanding || 0;
        const netDebt = companyData?.market_data?.net_debt || 0;

        // Build the JSON schema based on valuation method
        const valuationFields = isDCF
            ? `"wacc": <percentage as number>,
  "terminal_growth_rate": <percentage as number>,
  "fair_value_per_share": <number - PV of all cash flows / shares outstanding>,
  "valuation_method": "DCF",
  "dcf_calculation": {
    "pv_fcf_sum": <present value of forecast period FCFs in millions>,
    "terminal_value": <terminal value in millions>,
    "enterprise_value": <total EV in millions>,
    "equity_value": <EV minus net debt in millions>,
    "shares_outstanding": <number of shares>,
    "fair_value_per_share": <equity value / shares>
  }`
            : `"exit_multiple_type": "${multipleType !== 'auto' ? multipleType : '<P/E or EV/EBITDA or EV/FCF or Price/Sales>'}",
  "exit_multiple_value": <number - the multiple you are applying>,
  "fair_value_per_share": <number - calculated from the multiple>,
  "valuation_method": "exit-multiple",
  "exit_multiple_calculation": {
    "terminal_metric": <terminal year value of the metric being multiplied, in millions for EV-based or EPS for P/E>,
    "enterprise_value": <for EV multiples: metric × multiple, in millions>,
    "net_debt": ${netDebt / 1_000_000},
    "equity_value": <EV - net debt, in millions>,
    "shares_outstanding": ${sharesOutstanding},
    "fair_value_per_share": <equity_value / shares OR EPS × P/E>
  }`;

        const userMessage = `Based on all research conducted, generate a ${forecastStart}-${forecastEnd} forecast for ${ticker}.

LATEST ACTUAL DATA (FY${latestFY}):
- Revenue: $${((fy.revenue || 0) / 1_000_000).toFixed(0)}M
- Gross Margin: ${(fy.gross_margin_pct || 0).toFixed(1)}%
- EBITDA: $${((fy.ebitda || 0) / 1_000_000).toFixed(0)}M
- Net Income: $${((fy.net_income || 0) / 1_000_000).toFixed(0)}M
- EPS: $${(fy.eps || 0).toFixed(2)}
- Shares Outstanding: ${(sharesOutstanding / 1_000_000).toFixed(1)}M
- Net Debt: $${(netDebt / 1_000_000).toFixed(0)}M

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
  ${valuationFields},
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
     * @param {string} ticker - Stock ticker symbol
     * @param {Object} companyData - Company financial data
     * @param {string|null} sonarInsights - Initial insights from Perplexity
     * @param {Object} options - Configuration options
     * @param {string} options.method - 'dcf' or 'exit-multiple'
     * @param {string} options.multipleType - 'auto', 'P/E', 'EV/EBITDA', 'EV/FCF', 'Price/Sales'
     * @param {string|null} options.feedback - User feedback for refinement
     */
    async generateForecast(ticker, companyData, sonarInsights, options = {}) {
        const { method = 'exit-multiple', multipleType = 'auto', feedback = null } = options;

        this.startTime = Date.now();
        this.conversationHistory = [];
        this.researchTrail = [];
        this.totalTokens = { input: 0, output: 0 };
        this.webSearchCount = 0;
        this.llmCallCount = 0;

        // Store options for use in steps
        this.valuationMethod = method;
        this.multipleType = multipleType;
        this.userFeedback = feedback;

        console.log(`[AgenticForecaster] Starting agentic forecast for ${ticker} (method: ${method}, multiple: ${multipleType})`);
        if (feedback) console.log(`[AgenticForecaster] User feedback: ${feedback.substring(0, 100)}...`);

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

            // Step 3: Draft Forecast - pass method, multiple, and feedback
            console.log('[AgenticForecaster] Step 3: Draft Forecast');
            const draftForecast = await this.step3_draftForecast(
                ticker,
                companyData,
                researchFindings,
                { method, multipleType, feedback }
            );

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
            } else if (exitMultipleType === 'Price/Sales' || exitMultipleType === 'P/S') {
                // Price/Sales: Enterprise Value / Sales
                const enterpriseValue = terminalRevenue * exitMultipleValue;
                const netDebt = companyData?.market_data?.net_debt || 0;
                const equityValue = enterpriseValue - netDebt;
                calculatedValue = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
                metricUsed = terminalRevenue / 1_000_000;
                calculationMethod = `$${(terminalRevenue / 1_000_000).toFixed(0)}M Revenue × ${exitMultipleValue}x = $${(enterpriseValue / 1_000_000).toFixed(0)}M EV`;
            }

            // Get net debt for bridge calculation
            const netDebt = companyData?.market_data?.net_debt || 0;

            // Calculate EV for bridge (for EV-based multiples)
            let enterpriseValue = 0;
            let equityValue = 0;
            if (exitMultipleType === 'EV/EBITDA') {
                enterpriseValue = terminalEbitda * exitMultipleValue;
                equityValue = enterpriseValue - netDebt;
            } else if (exitMultipleType === 'EV/FCF') {
                enterpriseValue = terminalFcf * exitMultipleValue;
                equityValue = enterpriseValue - netDebt;
            } else if (exitMultipleType === 'Price/Sales' || exitMultipleType === 'P/S') {
                enterpriseValue = terminalRevenue * exitMultipleValue;
                equityValue = enterpriseValue - netDebt;
            }

            // Check if this is a DCF valuation
            const isDCF = this.valuationMethod === 'dcf' || draftForecast.valuation_method === 'DCF';

            // SERVER-SIDE DCF CALCULATION (always compute, don't rely on LLM)
            let dcfFairValue = 0;
            let dcfCalculationData = null;

            if (isDCF && projections.length > 0) {
                // Get WACC and terminal growth rate (from LLM or use defaults)
                const wacc = (draftForecast.wacc || 10) / 100; // Convert percentage to decimal
                const terminalGrowth = (draftForecast.terminal_growth_rate || 2.5) / 100;

                // Calculate present value of each year's FCF
                let pvFcfSum = 0;
                const fcfProjections = [];

                for (let i = 0; i < projections.length; i++) {
                    const proj = projections[i];
                    const revenue = Number(proj.revenue || 0) * 1_000_000; // Convert from millions
                    const fcfMargin = Number(proj.fcfMargin || 0) / 100;
                    const fcf = revenue * fcfMargin;

                    // Discount factor = 1 / (1 + wacc)^(year)
                    const year = i + 1;
                    const discountFactor = 1 / Math.pow(1 + wacc, year);
                    const pvFcf = fcf * discountFactor;

                    pvFcfSum += pvFcf;
                    fcfProjections.push({
                        year: proj.year,
                        fcf: fcf / 1_000_000, // Back to millions
                        discountFactor,
                        pvFcf: pvFcf / 1_000_000
                    });
                }

                // Calculate terminal value using Gordon Growth Model
                // TV = FCF_terminal × (1 + g) / (WACC - g)
                if (wacc > terminalGrowth) {
                    const terminalFcfValue = terminalFcf; // Already in full dollars from earlier
                    const terminalValue = (terminalFcfValue * (1 + terminalGrowth)) / (wacc - terminalGrowth);

                    // Discount terminal value to present
                    const terminalYearNumber = projections.length;
                    const tvDiscountFactor = 1 / Math.pow(1 + wacc, terminalYearNumber);
                    const pvTerminalValue = terminalValue * tvDiscountFactor;

                    // Total enterprise value = PV of FCFs + PV of Terminal Value
                    const dcfEnterpriseValue = pvFcfSum + pvTerminalValue;
                    const dcfEquityValue = dcfEnterpriseValue - netDebt;

                    dcfFairValue = sharesOutstanding > 0 ? dcfEquityValue / sharesOutstanding : 0;

                    dcfCalculationData = {
                        wacc: wacc * 100, // Back to percentage for display
                        terminalGrowthRate: terminalGrowth * 100,
                        pv_fcf_sum: pvFcfSum / 1_000_000,
                        terminal_value: terminalValue / 1_000_000,
                        pv_terminal_value: pvTerminalValue / 1_000_000,
                        enterprise_value: dcfEnterpriseValue / 1_000_000,
                        net_debt: netDebt / 1_000_000,
                        equity_value: dcfEquityValue / 1_000_000,
                        shares_outstanding: sharesOutstanding,
                        fair_value_per_share: dcfFairValue,
                        fcf_projections: fcfProjections
                    };
                } else {
                    // Fallback: WACC <= terminal growth (invalid), use FCF data for display
                    console.log('[AgenticForecaster] DCF calculation invalid (WACC <= terminal growth), using fallback');
                    dcfCalculationData = {
                        wacc: wacc * 100,
                        terminalGrowthRate: terminalGrowth * 100,
                        pv_fcf_sum: pvFcfSum / 1_000_000,
                        terminal_value: 0,
                        pv_terminal_value: 0,
                        enterprise_value: pvFcfSum / 1_000_000,
                        net_debt: netDebt / 1_000_000,
                        equity_value: (pvFcfSum - netDebt) / 1_000_000,
                        shares_outstanding: sharesOutstanding,
                        fair_value_per_share: 0,
                        fcf_projections: fcfProjections,
                        calculation_issue: 'WACC must be greater than terminal growth rate'
                    };
                }
            } else if (isDCF) {
                // DCF requested but no projections available
                console.log('[AgenticForecaster] DCF requested but no projections available, using fallback');
                dcfCalculationData = {
                    wacc: 10,
                    terminalGrowthRate: 2.5,
                    pv_fcf_sum: 0,
                    terminal_value: 0,
                    enterprise_value: 0,
                    net_debt: netDebt / 1_000_000,
                    equity_value: 0,
                    shares_outstanding: sharesOutstanding,
                    fair_value_per_share: 0,
                    calculation_issue: 'No projection data available for DCF calculation'
                };
            }

            // If DCF was requested but calculation failed, fall back to exit multiple
            if (isDCF && dcfFairValue === 0 && calculatedValue === 0) {
                console.log('[AgenticForecaster] DCF calculation produced no value, falling back to LLM fair value');
                // Use LLM's fair value as fallback
            }

            // Determine fair value based on method
            let fairValue;
            if (isDCF && dcfFairValue > 0) {
                fairValue = dcfFairValue;
            } else if (calculatedValue > 0) {
                fairValue = calculatedValue;
            } else {
                fairValue = draftForecast.fair_value_per_share || 0;
            }

            const upside = currentPrice > 0 && fairValue > 0
                ? ((fairValue - currentPrice) / currentPrice) * 100
                : 0;

            // Build calculation breakdown for frontend
            const exitMultipleCalculation = isDCF ? null : {
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
                // Add EV-to-share bridge for EV-based multiples
                enterpriseValue: enterpriseValue / 1_000_000,
                netDebt: netDebt / 1_000_000,
                equityValue: equityValue / 1_000_000,
                sharesOutstanding: sharesOutstanding,
                sharesOutstandingMillions: sharesOutstanding / 1_000_000,
                fairValue,
                currentPrice,
                upside,
                // For P/E, show the EPS × multiple calculation
                isEVBased: ['EV/EBITDA', 'EV/FCF', 'Price/Sales', 'P/S'].includes(exitMultipleType)
            };

            // Build DCF calculation breakdown (use server-computed data)
            const dcfCalculation = isDCF && dcfCalculationData ? {
                ...dcfCalculationData,
                fairValue,
                currentPrice,
                upside
            } : null;

            return {
                // Standard forecast fields (compatible with existing UI)
                companyName: companyData?.company_name || ticker,
                method: isDCF ? 'dcf' : 'exit-multiple',
                valuationMethod: isDCF ? 'dcf' : 'exit-multiple',
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

                // Calculation breakdowns (one will be null depending on method)
                exitMultipleCalculation: exitMultipleCalculation,
                dcfCalculation: dcfCalculation,

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
