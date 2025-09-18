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

    // Helper to run tasks with a concurrency limit
    const runWithConcurrencyLimit = async (tasks, limit) => {
      const results = new Array(tasks.length);
      let nextIndex = 0;
      const worker = async () => {
        while (true) {
          const current = nextIndex++;
          if (current >= tasks.length) break;
          results[current] = await tasks[current]();
        }
      };
      const workers = Array(Math.min(limit, tasks.length)).fill(0).map(worker);
      await Promise.all(workers);
      return results;
    };

    // Build valuation tasks for each holding
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3001';

    const tasks = holdings.map((holding) => async () => {
      try {
        console.log(`Fetching valuation for ${holding.ticker}...`);
        const url = `${baseUrl}/api/dcf-valuation?ticker=${encodeURIComponent(holding.ticker)}&method=${encodeURIComponent(method)}`;
        const valuationResponse = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!valuationResponse.ok) {
          const status = `${valuationResponse.status}`;
          console.error(`Failed to fetch valuation for ${holding.ticker}:`, status);
          return { error: `HTTP ${status}`, holding };
        }

        const valuationData = await valuationResponse.json();
        if (!valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
          console.error(`Invalid valuation data for ${holding.ticker}:`, valuationData);
          return { error: 'Invalid valuation data', holding };
        }

        let fairValuePerShare = valuationData.fairValue;
        if (valuationData.method === 'dcf' && valuationData.sourceMetrics?.sharesOutstanding > 0) {
          fairValuePerShare = (valuationData.fairValue * 1_000_000) / valuationData.sourceMetrics.sharesOutstanding;
        } else if (valuationData.method === 'exit-multiple' && valuationData.exitMultipleCalculation?.fairValue) {
          fairValuePerShare = valuationData.exitMultipleCalculation.fairValue;
        }

        return {
          ticker: holding.ticker,
          weight: holding.weight,
          fairValue: fairValuePerShare,
          upside: valuationData.upside,
          currentPrice: valuationData.currentSharePrice,
          method: valuationData.method,
        };
      } catch (error) {
        console.error(`Error processing ${holding.ticker}:`, error.message);
        return { error: error.message, holding };
      }
    });

    const CONCURRENCY = parseInt(process.env.PORTFOLIO_CONCURRENCY || '4', 10);
    const resultsParallel = await runWithConcurrencyLimit(tasks, CONCURRENCY);

    // Aggregate results
    const holdingResults = [];
    let totalWeightedReturn = 0;
    let totalWeightedFairValue = 0;

    for (const res of resultsParallel) {
      if (!res || res.error) {
        const h = res?.holding;
        if (h) {
          holdingResults.push({
            ticker: h.ticker,
            weight: h.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: 'dcf',
            error: res?.error || 'Unknown error'
          });
        }
        continue;
      }

      holdingResults.push(res);
      const weightedReturn = (res.weight / 100) * res.upside;
      const weightedFairValue = (res.weight / 100) * res.fairValue;
      totalWeightedReturn += weightedReturn;
      totalWeightedFairValue += weightedFairValue;
      console.log(`${res.ticker}: Fair Value $${res.fairValue.toFixed(2)}, Upside ${res.upside.toFixed(1)}%, Weighted Return ${weightedReturn.toFixed(2)}%`);
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
