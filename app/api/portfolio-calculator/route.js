import { NextResponse } from 'next/server';
import { GET as dcfValuationGET } from '../dcf-valuation/route.js';

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

    const holdingResults = [];
    let totalWeightedReturn = 0;
    let totalWeightedFairValue = 0;

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (const holding of holdings) {
      try {
        console.log(`Fetching valuation for ${holding.ticker} (direct call)...`);
        
        // Create a mock request object for the dcf-valuation GET handler
        const mockUrl = new URL(`http://localhost/api/dcf-valuation?ticker=${encodeURIComponent(holding.ticker)}&method=${encodeURIComponent(method)}`);
        const mockRequest = { url: mockUrl.toString() };
        
        // Call the dcf-valuation GET function directly with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Valuation timeout')), 55000) // 55 second timeout
        );
        
        const valuationResponse = await Promise.race([
          dcfValuationGET(mockRequest),
          timeoutPromise
        ]);
        
        // Handle NextResponse object
        let valuationData;
        try {
          if (valuationResponse && typeof valuationResponse.json === 'function') {
            valuationData = await valuationResponse.json();
          } else if (valuationResponse && valuationResponse.body) {
            // Try to parse response body
            const text = await valuationResponse.text();
            valuationData = JSON.parse(text);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (parseError) {
          console.error(`Failed to parse valuation response for ${holding.ticker}:`, parseError.message);
          holdingResults.push({
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: 'Invalid response format'
          });
          continue;
        }

        if (!valuationData || !valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
          console.error(`Invalid valuation data for ${holding.ticker}:`, valuationData);
          holdingResults.push({
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: valuationData?.error || 'Invalid valuation data'
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
