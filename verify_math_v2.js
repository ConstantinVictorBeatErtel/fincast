
// Math Verification Script for Bifurcated Logic

function calculateDCFLogic(inputs) {
    const {
        fcfStream, // [100, 100, 100, 100, 100]
        terminalFcf,
        terminalGrowth, // 2.0
        discountRate, // 10.0
        shares,
        netDebt,
        currentPrice,
        method,
        terminalMetric, // for Multiple
        multiple
    } = inputs;

    console.log(`\n--- METHOD: ${method.toUpperCase()} ---`);
    let fairValue = 0;

    if (method === 'dcf') {
        const r = discountRate / 100;
        const g = terminalGrowth / 100;
        let sumPv = 0;

        // Sum FCF
        fcfStream.forEach((val, idx) => {
            sumPv += val / Math.pow(1 + r, idx + 1);
        });

        // Terminal
        const tv = (terminalFcf * (1 + g)) / (r - g);
        const pvTv = tv / Math.pow(1 + r, fcfStream.length);

        const ev = sumPv + pvTv;
        const eqVal = ev - netDebt;
        fairValue = eqVal / shares;

        console.log(`Sum PV FCF: ${sumPv.toFixed(0)}`);
        console.log(`PV Terminal: ${pvTv.toFixed(0)} (TV: ${tv.toFixed(0)})`);
        console.log(`Enterprise Value: ${ev.toFixed(0)}`);
        console.log(`Equity Value: ${eqVal.toFixed(0)}`);
        console.log(`Fair Value (Discounted): $${fairValue.toFixed(2)}`);

    } else {
        // Exit Multiple
        // P/E logic
        const futurePrice = terminalMetric * multiple;
        // Undiscounted
        fairValue = futurePrice;

        console.log(`Future Price (Metric ${terminalMetric} * ${multiple}x): $${futurePrice}`);
        console.log(`Fair Value (Undiscounted): $${fairValue}`);
    }

    const upside = ((fairValue - currentPrice) / currentPrice) * 100;
    console.log(`Upside: ${upside.toFixed(2)}%`);
    return fairValue;
}

// Case 1: DCF
calculateDCFLogic({
    fcfStream: [100, 100, 100, 100, 100],
    terminalFcf: 100,
    terminalGrowth: 2.0,
    discountRate: 10.0,
    shares: 1, // units match FCF
    netDebt: 0,
    currentPrice: 1000,
    method: 'dcf',
    terminalMetric: 100,
    multiple: 20
});

// Case 2: Exit Multiple
calculateDCFLogic({
    fcfStream: [100, 100, 100, 100, 100],
    terminalFcf: 100,
    terminalGrowth: 2.0,
    discountRate: 10.0,
    shares: 1,
    netDebt: 0,
    currentPrice: 1000,
    method: 'exit-multiple',
    terminalMetric: 100,
    multiple: 20
});
