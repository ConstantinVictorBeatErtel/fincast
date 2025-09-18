#!/usr/bin/env node

// Simple batch test script
// Usage:
//   node scripts/batch_fair_values.js AAPL MSFT NVDA
//   node scripts/batch_fair_values.js AAPL,MSFT,NVDA
// Env:
//   BASE_URL (default http://localhost:3000)
//   METHOD   (default exit-multiple; alt: dcf)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const METHOD = (process.env.METHOD || 'exit-multiple').trim();

function parseTickersFromArgv(argv) {
  const args = argv.slice(2);
  if (args.length === 0) return [];
  const joined = args.join(',');
  return joined
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

async function fetchValuation(ticker) {
  const url = `${BASE_URL}/api/dcf-valuation?ticker=${encodeURIComponent(ticker)}&method=${encodeURIComponent(METHOD)}&multiple=auto`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Request failed for ${ticker}: ${res.status} ${txt}`);
  }
  return res.json();
}


function extractPerShareFairValueAndUpside(valuation) {
  const method = valuation?.method;
  const src = valuation?.sourceMetrics || {};
  const currentPrice = Number(valuation?.currentSharePrice || src.currentPrice || 0);
  const shares = Number(src.sharesOutstanding || 0); // raw share count
  const projections = Array.isArray(valuation?.projections) ? valuation.projections : [];
  const lastProj = projections[projections.length - 1] || {};

  // Exit-multiple: compute per-share directly from projections and multiple
  if (method === 'exit-multiple' && valuation?.exitMultipleCalculation) {
    const type = valuation.exitMultipleCalculation?.type;
    const multiple = Number(valuation.exitMultipleCalculation?.multiple || 0);

    if (type === 'P/E') {
      const eps = Number(lastProj?.eps || 0);
      if (eps > 0 && multiple > 0) {
        const perShare = eps * multiple; // per-share
        const up = currentPrice > 0 ? ((perShare - currentPrice) / currentPrice) * 100 : NaN;
        return { fairValue2029: perShare, upside: up };
      }
      return { fairValue2029: NaN, upside: NaN };
    }

    // EV-based multiples: derive equity = EV - netDebt and convert to per-share
    const currentEV_M = Number(src.enterpriseValue || 0); // $M per backend
    const marketCap_$ = Number(src.marketCap || 0); // $
    if (!(currentEV_M > 0 && marketCap_$ > 0 && shares > 0 && multiple > 0)) {
      return { fairValue2029: NaN, upside: NaN };
    }
    const netDebt_M = currentEV_M - (marketCap_$ / 1_000_000);

    let fairEV_M = NaN;
    if (type === 'EV/EBITDA') {
      const ebitda_M = Number(lastProj?.ebitda || 0);
      fairEV_M = ebitda_M * multiple;
    } else if (type === 'EV/FCF') {
      const fcf_M = Number(lastProj?.freeCashFlow || lastProj?.fcf || 0);
      fairEV_M = fcf_M * multiple;
    } else if (type === 'EV/Sales') {
      const revenue_M = Number(lastProj?.revenue || 0);
      fairEV_M = revenue_M * multiple;
    }
    if (!(fairEV_M > 0)) return { fairValue2029: NaN, upside: NaN };

    const fairEquity_M = fairEV_M - netDebt_M; // $M
    const perShare = (fairEquity_M * 1_000_000) / shares; // $
    const up = currentPrice > 0 ? ((perShare - currentPrice) / currentPrice) * 100 : NaN;
    return { fairValue2029: perShare, upside: up };
  }

  // DCF: fairValue is equity in $M -> per-share
  if (method === 'dcf' && valuation?.fairValue != null && shares > 0) {
    const fairEquity_$ = Number(valuation.fairValue) * 1_000_000;
    const perShare = fairEquity_$ / shares;
    const up = currentPrice > 0 ? ((perShare - currentPrice) / currentPrice) * 100 : NaN;
    return { fairValue2029: perShare, upside: up };
  }

  return { fairValue2029: NaN, upside: NaN };
}

async function main() {
  const tickers = parseTickersFromArgv(process.argv);
  if (tickers.length === 0) {
    console.error('Provide tickers. Example: node scripts/batch_fair_values.js AAPL MSFT ORCL');
    process.exit(1);
  }

  // Header
  console.log('ticker,fairValue2029,upside');

  for (const ticker of tickers) {
    try {
      const valuation = await fetchValuation(ticker);
      const { fairValue2029, upside } = extractPerShareFairValueAndUpside(valuation);
      const fv = Number.isFinite(fairValue2029) ? fairValue2029 : '';
      const up = Number.isFinite(upside) ? upside : '';
      console.log(`${ticker},${fv},${up}`);
    } catch (err) {
      console.log(`${ticker},,`); // keep CSV structure; empty on error
      console.error(`Error for ${ticker}:`, err.message);
    }
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});


