
// Simulation of the Valuation Logic in route.js

function calculateValuation(inputs) {
    const {
        terminalMetricVal,
        multipleUsed,
        discountRate,
        yearsToTerminal,
        realPrice,
        llmPrice,
        sharesOutstanding,
        currentEV,
        currentMCap,
        multipleType
    } = inputs;

    console.log("--- INPUTS ---");
    console.log(`Real Price (YFinance): $${realPrice}`);
    console.log(`LLM Price (Hallucinated): $${llmPrice}`);
    console.log(`Terminal Metric: ${terminalMetricVal} (Type: ${multipleType})`);
    console.log(`Multiple: ${multipleUsed}x`);

    // --- LOGIC START (Copied from route.js) ---

    let futureSharePrice = 0;
    let netDebt = 0;
    let futureEquityValue = 0;

    // Calculate Net Debt
    if (currentEV > 0 && currentMCap > 0) {
        netDebt = currentEV - currentMCap;
    }

    if (multipleType === 'P/E') {
        futureSharePrice = terminalMetricVal * multipleUsed;
    } else {
        // EV based
        const futureEV = terminalMetricVal * multipleUsed; // $M
        futureEquityValue = futureEV - netDebt; // $M

        if (sharesOutstanding > 0) {
            futureSharePrice = (futureEquityValue * 1000000) / sharesOutstanding;
        }
    }

    // Discount to Present
    // Normalize rate
    let dr = discountRate;
    if (dr < 1.0) dr = dr * 100;

    const presentFairValue = futureSharePrice / Math.pow(1 + (dr / 100), yearsToTerminal);

    // 4. Calculate Upside
    // CRITICAL FIX: Always use YFinance (Real) price first.
    const currentPrice = realPrice || llmPrice || 1;
    const calculatedUpside = ((presentFairValue - currentPrice) / currentPrice) * 100;

    // --- LOGIC END ---

    console.log("\n--- RESULTS ---");
    console.log(`Future Share Price (2030): $${futureSharePrice.toFixed(2)}`);
    console.log(`Present Fair Value: $${presentFairValue.toFixed(2)}`);
    console.log(`Used Current Price for Upside: $${currentPrice}`);
    console.log(`Calculated Upside: ${calculatedUpside.toFixed(2)}%`);

    return { presentFairValue, calculatedUpside };
}

// TEST CASE 1: LLY Scenario (Hypothetical)
// Fair Value ~1600. Real Price ~1000. LLM thinks Price is 2000 (causing negative upside previously).
const result = calculateValuation({
    terminalMetricVal: 32, // EPS in 2030
    multipleUsed: 50,      // P/E
    discountRate: 9,
    yearsToTerminal: 5,
    realPrice: 1000,       // Real
    llmPrice: 2000,        // Hallucinated/Stale
    sharesOutstanding: 1000000,
    currentEV: 0,
    currentMCap: 0,
    multipleType: 'P/E'
});

console.log("\n--- VERIFICATION ---");
if (result.calculatedUpside > 0) {
    console.log("SUCCESS: Upside is positive. System used Real Price ($1000).");
} else {
    console.log("FAILURE: Upside is negative. System used LLM Price ($2000).");
}
