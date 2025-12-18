import { fetchForecastData } from './data-fetcher';
import { buildCompressedPrompt } from './prompt-builder';
import { validateForecast } from './forecast-validator';

const forecastCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function generateStandardForecast(ticker, companyName, options = {}) {
    const startTime = performance.now();
    ticker = ticker.toUpperCase();

    // 1. Check Cache (Skip LLM if valid and no custom feedback)
    if (!options.feedback && !options.forceRefresh) {
        const cached = forecastCache.get(ticker);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`[GeminiForecast] ${ticker}: Returning cached forecast`);
            return cached.data;
        }
    }

    try {
        // Step 1: Fetch and validate data
        console.log(`[GeminiForecast] ${ticker}: Fetching data...`);
        // Pass headers from options (if provided) to enable authenticated internal requests
        const data = await fetchForecastData(ticker, options.headers || {});

        // Step 2: Build compressed prompt
        console.log(`[GeminiForecast] ${ticker}: Building prompt...`);

        // Use official name from YFinance to prevent ambiguity (e.g. "MS" -> "Morgan Stanley", not "Microsoft")
        const officialName = data.yfinanceData?.shortName || data.yfinanceData?.longName || companyName;

        const prompt = buildCompressedPrompt(ticker, officialName, data, options.feedback);
        // Calculate prompt size (approx)
        const promptTokens = Math.ceil(prompt.length / 4);

        // Step 3: Call Gemini via OpenRouter
        console.log(`[GeminiForecast] ${ticker}: Calling Gemini (Flash)...`);

        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error('OPENROUTER_API_KEY is not configured');
        }

        let aiRes;
        const maxRetries = 5; // Increased from 3

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
                        model: 'google/gemini-2.5-flash', // Updated to exact model requested
                        messages: [
                            { role: 'system', content: 'You are a financial analyst. Return EXACT JSON only. No markdown.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.3,
                        response_format: { type: 'json_object' } // Hint for JSON
                    })
                });

                if (response.status === 429) {
                    console.warn(`[GeminiForecast] ${ticker}: Rate limit (429) on attempt ${attempt}. Waiting...`);
                    // Exponential backoff: 2s, 5s, 10s, 20s, 40s
                    const waitMs = attempt === 1 ? 2000 : 5000 * Math.pow(2, attempt - 2);
                    await new Promise(r => setTimeout(r, waitMs));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`OpenRouter API failed: ${response.status} ${response.statusText}`);
                }

                aiRes = await response.json();
                break; // Success

            } catch (e) {
                if (attempt === maxRetries) throw e;
                console.warn(`[GeminiForecast] ${ticker}: Attempt ${attempt} failed (${e.message}). Retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        if (!aiRes) throw new Error('Failed to get response from AI after retries');

        const rawText = aiRes.choices?.[0]?.message?.content || '{}';

        // Step 4: Parse response
        console.log(`[GeminiForecast] ${ticker}: Parsing response...`);
        let forecast;
        try {
            // Remove any markdown formatting if present
            const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
            forecast = JSON.parse(cleaned);
        } catch (parseError) {
            console.error(`[GeminiForecast] ${ticker}: JSON parse error`, parseError);
            throw new Error(`Failed to parse forecast response: ${parseError.message}`);
        }

        // Step 5: Validate output
        console.log(`[GeminiForecast] ${ticker}: Validating...`);
        const validationResult = validateForecast(forecast, data);

        if (!validationResult.isValid) {
            console.error(`[GeminiForecast] ${ticker}: Validation errors`, validationResult.errors);
            throw new Error(`Invalid forecast: ${validationResult.errors.join(', ')}`);
        }

        // Step 6: Calculate costs (Estimated)
        const responseTokens = Math.ceil(rawText.length / 4);
        // OpenRouter / Gemini Flash pricing is very low or free. Estimating conservatively.
        const inputCost = (promptTokens / 1_000_000) * 0.10;
        const outputCost = (responseTokens / 1_000_000) * 0.40;
        const totalCost = inputCost + outputCost;

        const duration = (Date.now() - startTime) / 1000;

        console.log(`[GeminiForecast] ${ticker}: Completed in ${duration.toFixed(1)}s, cost ~$${totalCost.toFixed(6)}`);

        // Step 7: Return enriched forecast
        const result = {
            forecast: {
                ...forecast,
                ticker,
                companyName,
                generatedAt: new Date().toISOString(),
                dataQuality: data.dataQuality,
                validation: validationResult,
                // Pass through source data needed for UI
                historicalData: data.historicalData,
                yfinanceData: data.yfinanceData,
                sonarData: data.sonarData
            },
            metadata: {
                duration,
                promptTokens,
                responseTokens,
                totalTokens: promptTokens + responseTokens,
                cost: totalCost, // Estimated cost
                dataQualityScore: data.dataQuality?.score,
                confidenceLevel: validationResult.confidenceLevel,
                confidenceScore: validationResult.adjustedConfidence,
                warnings: validationResult.warnings,
                recommendation: validationResult.recommendation
            }
        };

        // Cache the successful result
        if (!options.feedback) {
            forecastCache.set(ticker, {
                timestamp: Date.now(),
                data: result
            });
        }

        return result;

    } catch (error) {
        console.error(`[GeminiForecast] ${ticker}: Failed`, error);

        return {
            forecast: null,
            metadata: {
                error: error.message,
                duration: (Date.now() - startTime) / 1000,
                ticker,
                companyName
            }
        };
    }
}
