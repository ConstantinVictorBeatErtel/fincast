export function validateForecast(forecast, inputData) {
    const warnings = [];
    const errors = [];
    let confidenceAdjustment = 0;

    const { projections, dcf } = forecast;
    const currentMetrics = inputData.yfinanceData;

    // Convert projections object to array sorted by year
    const sortedYears = Object.keys(projections).sort();
    const sortedProjections = sortedYears.map(y => projections[y]);

    // 1. Check revenue growth deceleration
    const growthRates = sortedProjections
        .filter(p => p.revenueGrowth !== null && p.revenueGrowth !== undefined)
        .map(p => Number(p.revenueGrowth));

    if (growthRates.length > 1) {
        let lastGrowth = growthRates[0];
        let accelerating = false;
        for (let i = 1; i < growthRates.length; i++) {
            // Allow slight acceleration (e.g. recovery year), but flag significant sustained acceleration
            if (growthRates[i] > lastGrowth + 2) {
                accelerating = true;
                break;
            }
            lastGrowth = growthRates[i];
        }

        if (accelerating) {
            warnings.push('⚠️ Revenue growth accelerates significantly over time - unusual pattern');
            confidenceAdjustment -= 10;
        }
    }

    // 2. Check margin expansion
    const marginFirst = Number(sortedProjections[0]?.ebitdaMargin || 0);
    const marginLast = Number(sortedProjections[sortedProjections.length - 1]?.ebitdaMargin || 0);
    const marginChange = marginLast - marginFirst;

    if (marginChange > 10) {
        warnings.push(`⚠️ EBITDA margin expands ${marginChange.toFixed(1)}pp - very aggressive`);
        confidenceAdjustment -= 15;
    } else if (marginChange < -10) {
        warnings.push(`⚠️ EBITDA margin compresses ${Math.abs(marginChange).toFixed(1)}pp - concerning`);
        confidenceAdjustment -= 10;
    }

    // 3. Check terminal value dominance
    if (dcf.terminalValuePercent > 75) {
        warnings.push(`⚠️ Terminal value is ${dcf.terminalValuePercent}% of DCF - too high dependency on outer years`);
        confidenceAdjustment -= 20;
    }

    // 4. Check implied multiples vs current
    const currentPE = Number(currentMetrics.peRatio || 20);
    const impliedPE = Number(dcf.impliedForwardPE || 0);

    if (impliedPE > 0 && currentPE > 0) {
        const peChange = ((impliedPE - currentPE) / currentPE) * 100;
        if (Math.abs(peChange) > 50) {
            warnings.push(`⚠️ Implied P/E (${impliedPE.toFixed(1)}) differs ${peChange.toFixed(0)}% from current (${currentPE.toFixed(1)})`);
            confidenceAdjustment -= 15;
        }
    }

    // 5. Check for unrealistic growth given market cap
    const finalRevenue = sortedProjections[sortedProjections.length - 1]?.revenue;
    const initRevenue = currentMetrics.revenue;
    if (finalRevenue && initRevenue) {
        const totalGrowth = ((finalRevenue - initRevenue) / initRevenue) * 100;
        if (totalGrowth > 300) { // > 4x revenue in 5 years
            warnings.push(`⚠️ Projected 5Y revenue growth of ${totalGrowth.toFixed(0)}% may be unrealistic for this size`);
            confidenceAdjustment -= 15;
        }
    }

    // 6. Check terminal growth rate
    if (dcf.terminalGrowthRate > 3.5) {
        warnings.push(`⚠️ Terminal growth of ${dcf.terminalGrowthRate}% exceeds likely long-term GDP growth`);
        confidenceAdjustment -= 10;
    } else if (dcf.terminalGrowthRate < 0) {
        warnings.push(`⚠️ Negative terminal growth assumed`);
    }

    // 7. Data quality check integration
    const qualityScore = inputData.dataQuality?.score || 100;
    if (qualityScore < 70) {
        warnings.push(`⚠️ Underlying data quality score is low (${qualityScore}/100)`);
        confidenceAdjustment -= (100 - qualityScore) * 0.5;
    }

    // 8. Check for zeros or nulls in projections
    sortedProjections.forEach((proj, idx) => {
        if (idx === 0) return; // Skip base year might utilize actuals
        if (!proj.revenue || proj.revenue === 0) {
            // It's an error if we miss revenue projections
            errors.push(`❌ Missing revenue projection for Year ${idx}`);
        }
    });

    // Calculate adjusted confidence
    const modelConfidence = forecast.confidenceScore || 70;
    const adjustedConfidence = Math.round(Math.max(0, Math.min(100, modelConfidence + confidenceAdjustment)));

    let confidenceLevel = 'Low';
    if (adjustedConfidence >= 75) confidenceLevel = 'High';
    else if (adjustedConfidence >= 50) confidenceLevel = 'Medium';

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        confidenceAdjustment,
        adjustedConfidence,
        confidenceLevel,
        recommendation: getRecommendation(adjustedConfidence, warnings)
    };
}

function getRecommendation(confidence, warnings) {
    if (confidence >= 75 && warnings.length === 0) {
        return 'Forecast appears reliable. Assumptions are reasonable.';
    } else if (confidence >= 50 && warnings.length <= 2) {
        return 'Forecast is acceptable but has some concerns. Review assumptions carefully.';
    } else if (confidence >= 30) {
        return '⚠️ Low confidence forecast. Agentic verification recommended.';
    } else {
        return '❌ Very low confidence. Data quality issues or unrealistic projections. Manual review required.';
    }
}
