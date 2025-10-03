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

    console.log('Running valuations in parallel for all holdings...');

    // Process all holdings in parallel
    const valuationPromises = holdings.map(async (holding) => {
      try {
        console.log(`Starting valuation for ${holding.ticker}...`);

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
            // Get the response text first to check if it's HTML or JSON
            const responseClone = valuationResponse.clone();
            const responseText = await responseClone.text();

            // Check if response is HTML (Vercel timeout error page)
            if (responseText.trim().startsWith('<') || responseText.includes('An error occurred')) {
              throw new Error('Valuation request timed out or returned HTML error');
            }

            // Try to parse as JSON
            valuationData = await valuationResponse.json();
          } else if (valuationResponse && valuationResponse.body) {
            const text = await valuationResponse.text();
            if (text.trim().startsWith('<') || text.includes('An error occurred')) {
              throw new Error('Valuation request timed out or returned HTML error');
            }
            valuationData = JSON.parse(text);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (parseError) {
          console.error(`Failed to parse valuation response for ${holding.ticker}:`, parseError.message);
          return {
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: parseError.message.includes('timeout') ? 'Valuation timeout' : 'Invalid response format'
          };
        }

        if (!valuationData || !valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
          console.error(`Invalid valuation data for ${holding.ticker}:`, valuationData);
          return {
            ticker: holding.ticker,
            weight: holding.weight,
            fairValue: 0,
            upside: 0,
            currentPrice: 0,
            method: method,
            error: valuationData?.error || 'Invalid valuation data'
          };
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
        return {
          ticker: holding.ticker,
          weight: holding.weight,
          fairValue: 0,
          upside: 0,
          currentPrice: 0,
          method: method,
          error: error.message
        };
      }
    });

    // Wait for all valuations to complete
    const holdingResults = await Promise.all(valuationPromises);

    // Calculate totals
    let totalWeightedReturn = 0;
    let totalWeightedFairValue = 0;

    holdingResults.forEach(res => {
      const weightedReturn = (res.weight / 100) * res.upside;
      const weightedFairValue = (res.weight / 100) * res.fairValue;
      totalWeightedReturn += weightedReturn;
      totalWeightedFairValue += weightedFairValue;
      console.log(`${res.ticker}: Fair Value $${res.fairValue.toFixed(2)}, Upside ${res.upside.toFixed(1)}%, Weighted Return ${weightedReturn.toFixed(2)}%`);
    });

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
