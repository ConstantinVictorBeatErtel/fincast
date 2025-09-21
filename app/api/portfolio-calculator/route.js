import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { holdings, method = 'exit-multiple' } = await request.json();

    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return NextResponse.json(
        { error: 'Holdings array is required' },
        { status: 400 }
      );
    }

    // Validate weights sum to 100%
    const totalWeight = holdings.reduce((sum, h) => sum + (h.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return NextResponse.json(
        { error: 'Weights must sum to 100%' },
        { status: 400 }
      );
    }

    console.log(`Calculating portfolio for ${holdings.length} holdings:`, holdings.map(h => `${h.ticker} (${h.weight}%)`));

    // Sequential valuation fetches to avoid rate limiting
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';

    const holdingResults = [];
    let totalWeightedReturn = 0;
    let totalWeightedFairValue = 0;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const fetchWithRetry = async (url, options, attempts = 3, baseDelayMs = 800) => {
      for (let i = 0; i < attempts; i++) {
        const res = await fetch(url, options);
        if (res.ok) return res;
        if (![401, 429, 500, 502, 503, 504].includes(res.status)) return res;
        const delay = baseDelayMs * Math.pow(2, i);
        await sleep(delay);
      }
      return fetch(url, options);
    };

    const internalHeaders = {};
    if (process.env.VERCEL_PROTECTION_BYPASS) {
      internalHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_PROTECTION_BYPASS;
    }
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      internalHeaders['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }
    
    // For local testing, always add a test bypass header
    if (!process.env.VERCEL_URL) {
      internalHeaders['x-vercel-automation-bypass'] = 'local-test-token';
    }
    
    console.log('Portfolio Calculator - Internal headers:', internalHeaders);

    for (const holding of holdings) {
      try {
        console.log(`Fetching valuation for ${holding.ticker} (sequential)...`);
        const url = `${baseUrl}/api/dcf-valuation?ticker=${encodeURIComponent(holding.ticker)}&method=${encodeURIComponent(method)}`;
        const valuationResponse = await fetchWithRetry(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...internalHeaders },
        });

        if (!valuationResponse.ok) {
          const status = `${valuationResponse.status}`;
          console.error(`Failed to fetch valuation for ${holding.ticker}:`, status);
          holdingResults.push({
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: `HTTP ${status}`
          });
          continue;
        }

        const valuationData = await valuationResponse.json();
        if (!valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
          console.error(`Invalid valuation data for ${holding.ticker}:`, valuationData);
          holdingResults.push({
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: 'Invalid valuation data'
          });
          continue;
        }

        let fairValuePerShare = valuationData.fairValue;
        if (valuationData.method === 'dcf' && valuationData.sourceMetrics?.sharesOutstanding > 0) {
          fairValuePerShare = (valuationData.fairValue * 1_000_000) / valuationData.sourceMetrics.sharesOutstanding;
        } else if (valuationData.method === 'exit-multiple' && valuationData.exitMultipleCalculation?.fairValue) {
          fairValuePerShare = valuationData.exitMultipleCalculation.fairValue;
        }

        const res = {
          ticker: holding.ticker,
          weight: holding.weight,
          fairValue: fairValuePerShare,
          upside: valuationData.upside,
          currentPrice: valuationData.currentSharePrice,
          method: valuationData.method,
        };
        holdingResults.push(res);

        const weightedReturn = (res.weight / 100) * res.upside;
        const weightedFairValue = (res.weight / 100) * res.fairValue;
        totalWeightedReturn += weightedReturn;
        totalWeightedFairValue += weightedFairValue;
        console.log(`${res.ticker}: Fair Value $${res.fairValue.toFixed(2)}, Upside ${res.upside.toFixed(1)}%, Weighted Return ${weightedReturn.toFixed(2)}%`);

        // Small delay between calls to avoid provider rate limits
        await sleep(500);
      } catch (error) {
        console.error(`Error processing ${holding.ticker}:`, error.message);
        holdingResults.push({
          ticker: holding.ticker,
          weight: holding.weight,
          fairValue: 0,
          upside: 0,
          currentPrice: 0,
          method: method,
          error: error.message
        });
      }
    }

    const portfolioResult = {
      expectedReturn: totalWeightedReturn,
      weightedFairValue: totalWeightedFairValue,
      holdings: holdingResults,
      totalHoldings: holdings.length,
      calculationDate: new Date().toISOString()
    };

    console.log(`Portfolio calculation complete. Expected return: ${totalWeightedReturn.toFixed(2)}%`);

    return NextResponse.json(portfolioResult);

  } catch (error) {
    console.error('Portfolio calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate portfolio returns' },
      { status: 500 }
    );
  }
}
