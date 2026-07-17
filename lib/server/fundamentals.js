const SEC_HEADERS = {
  'User-Agent': 'Fincast/1.0 support@fincast.app',
  'Accept': 'application/json',
};

let tickerMapPromise = null;

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toMillions(value) {
  return safeNumber(value) / 1_000_000;
}

function latestEntry(entries = []) {
  return [...entries]
    .filter((entry) => typeof entry?.val === 'number')
    .sort((a, b) => String(b?.end || b?.filed || '').localeCompare(String(a?.end || a?.filed || '')))[0] || null;
}

function annualByFiscalYear(facts = []) {
  const allowedForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
  const annualFacts = facts.filter((entry) =>
    entry &&
    typeof entry.val === 'number' &&
    allowedForms.has(entry.form)
  );

  const byYear = new Map();
  for (const entry of annualFacts) {
    const start = entry?.start ? new Date(entry.start) : null;
    const end = entry?.end ? new Date(entry.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (durationDays < 300) continue;
    const year = end.getUTCFullYear();
    const existing = byYear.get(year);
    if (!existing || String(entry.filed || entry.end || '') > String(existing.filed || existing.end || '')) {
      byYear.set(year, entry);
    }
  }
  return byYear;
}

function pickMetric(facts, metricNames, units) {
  let best = [];
  let bestScore = -1;
  for (const metricName of metricNames) {
    const metric = facts?.[metricName];
    if (!metric?.units) continue;
    for (const unit of units) {
      if (Array.isArray(metric.units?.[unit]) && metric.units[unit].length > 0) {
        const entries = metric.units[unit];
        const latestTs = entries.reduce((max, entry) => {
          const ts = Date.parse(entry?.end || entry?.filed || '') || 0;
          return Math.max(max, ts);
        }, 0);
        const score = latestTs * 1000 + entries.length;
        if (score > bestScore) {
          best = entries;
          bestScore = score;
        }
      }
    }
  }
  return best;
}

async function getSecTickerMap() {
  if (!tickerMapPromise) {
    tickerMapPromise = fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: SEC_HEADERS,
      cache: 'force-cache',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`SEC ticker list failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const map = new Map();
        for (const item of Object.values(payload || {})) {
          if (item?.ticker) {
            map.set(String(item.ticker).toUpperCase(), {
              cik: String(item.cik_str).padStart(10, '0'),
              title: item.title,
            });
          }
        }
        return map;
      });
  }
  return tickerMapPromise;
}

// Finnhub free tier (60 req/min) is the most reliable option from serverless
// IPs but needs a key: grab one free at https://finnhub.io and set
// FINNHUB_API_KEY in Vercel. Skipped silently when the key is absent.
export async function fetchPriceFromFinnhub(ticker) {
  const apiKey = process.env.FINNHUB_API_KEY;
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!apiKey || !symbol) return 0;
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
    );
    if (!response.ok) return 0;
    const payload = await response.json();
    const price = safeNumber(payload?.c, 0) || safeNumber(payload?.pc, 0);
    return price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

// Cboe's delayed-quote CDN is keyless, JSON, and served from a public CDN, so
// it works from datacenter IPs where Yahoo/Stooq block. US listings, 15-min
// delayed — fine for valuation purposes.
export async function fetchPriceFromCboe(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol || !/^[A-Z][A-Z0-9.\-]*$/.test(symbol)) return 0;
  try {
    const response = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/quotes/${encodeURIComponent(symbol)}.json`,
      {
        headers: { 'User-Agent': SEC_HEADERS['User-Agent'], 'Accept': 'application/json' },
        cache: 'no-store',
      }
    );
    if (!response.ok) return 0;
    const payload = await response.json();
    const quote = payload?.data || {};
    const price = safeNumber(quote.current_price, 0) ||
      safeNumber(quote.close, 0) ||
      safeNumber(quote.prev_day_close, 0);
    return price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

// Yahoo's chart endpoint does not require the cookie/crumb handshake that
// breaks quoteSummary on datacenter IPs, so it is the most reliable free
// price source from serverless environments.
export async function fetchPriceFromYahooChart(ticker) {
  const symbol = String(ticker || '').trim().toUpperCase();
  if (!symbol) return 0;

  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const meta = payload?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      // Downstream pipeline works in USD; skip non-USD listings so we do not
      // mix currencies (Stooq's .US quotes below stay USD-denominated).
      if (meta.currency && String(meta.currency).toUpperCase() !== 'USD') continue;
      const price = safeNumber(meta.regularMarketPrice, 0) ||
        safeNumber(meta.previousClose, 0) ||
        safeNumber(meta.chartPreviousClose, 0);
      if (price > 0) return price;
    } catch {
      // Try next host.
    }
  }

  return 0;
}

export async function fetchCurrentPriceDetailed(ticker) {
  const sources = [
    ['finnhub', fetchPriceFromFinnhub],
    ['cboe', fetchPriceFromCboe],
    ['yahoo-chart', fetchPriceFromYahooChart],
    ['stooq', fetchCurrentPriceFromStooq],
  ];
  for (const [source, fetcher] of sources) {
    const price = await fetcher(ticker).catch(() => 0);
    if (price > 0) return { price, source };
  }
  return { price: 0, source: 'none' };
}

export async function fetchCurrentPrice(ticker) {
  const { price } = await fetchCurrentPriceDetailed(ticker);
  return price;
}

// Backfills market_data.current_price (and derived fields) when the primary
// data source returned financials without a usable share price.
export async function ensureCurrentPrice(data, ticker) {
  if (!data) return data;
  if (!data.market_data) data.market_data = {};
  const marketData = data.market_data;

  if (safeNumber(marketData.current_price) > 0) return data;

  const { price, source } = await fetchCurrentPriceDetailed(ticker).catch(() => ({ price: 0, source: 'none' }));
  if (!(price > 0)) {
    console.warn(`[Price Fallback] No live price found for ${ticker} (all sources failed)`);
    return data;
  }

  console.log(`[Price Fallback] Patched ${ticker} current_price=$${price.toFixed(2)} via ${source} (data source=${data.source || 'unknown'})`);
  marketData.current_price = price;
  marketData.price_source = source;

  const sharesOutstanding = safeNumber(
    data.fy24_financials?.shares_outstanding || marketData.shares_outstanding
  );
  if (safeNumber(marketData.market_cap) <= 0 && sharesOutstanding > 0) {
    marketData.market_cap = price * sharesOutstanding;
  }
  if (safeNumber(marketData.enterprise_value) <= 0 && safeNumber(marketData.market_cap) > 0) {
    marketData.enterprise_value = marketData.market_cap + safeNumber(marketData.net_debt);
  }
  const eps = safeNumber(data.fy24_financials?.eps);
  if (safeNumber(marketData.pe_ratio) <= 0 && eps > 0) {
    marketData.pe_ratio = price / eps;
  }

  return data;
}

export async function fetchCurrentPriceFromStooq(ticker) {
  const candidates = [`${ticker}.US`, ticker]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(candidate)}&i=d`, {
        headers: { 'User-Agent': SEC_HEADERS['User-Agent'] },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const text = (await response.text()).trim();
      if (!text || text.includes('N/D')) continue;
      const parts = text.split(',');
      const close = safeNumber(parts[6], NaN);
      if (Number.isFinite(close) && close > 0) {
        return close;
      }
    } catch {
      // Continue to next candidate.
    }
  }

  return 0;
}

export async function fetchSecFinancialData(ticker) {
  try {
    const map = await getSecTickerMap();
    const company = map.get(String(ticker || '').toUpperCase());
    if (!company) return null;

    const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`, {
      headers: SEC_HEADERS,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`SEC companyfacts failed: ${response.status}`);
    }

    const payload = await response.json();
    const usGaap = payload?.facts?.['us-gaap'] || {};
    const dei = payload?.facts?.dei || {};

    const revenueByYear = annualByFiscalYear(pickMetric(usGaap, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'], ['USD']));
    const grossProfitByYear = annualByFiscalYear(pickMetric(usGaap, ['GrossProfit'], ['USD']));
    const operatingIncomeByYear = annualByFiscalYear(pickMetric(usGaap, ['OperatingIncomeLoss'], ['USD']));
    const netIncomeByYear = annualByFiscalYear(pickMetric(usGaap, ['NetIncomeLoss'], ['USD']));
    const ocfByYear = annualByFiscalYear(pickMetric(usGaap, ['NetCashProvidedByUsedInOperatingActivities'], ['USD']));
    const capexByYear = annualByFiscalYear(pickMetric(usGaap, ['PaymentsToAcquirePropertyPlantAndEquipment'], ['USD']));
    const epsByYear = annualByFiscalYear(pickMetric(usGaap, ['EarningsPerShareDiluted', 'DilutedEarningsPerShare'], ['USD/shares']));
    const dilutedSharesByYear = annualByFiscalYear(pickMetric(usGaap, ['WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'], ['shares']));
    const entityShares = latestEntry(pickMetric(dei, ['EntityCommonStockSharesOutstanding'], ['shares']));

    const years = [...revenueByYear.keys()].sort((a, b) => a - b).slice(-4);
    if (years.length === 0) return null;

    const latestSharesOutstanding = safeNumber(entityShares?.val || dilutedSharesByYear.get(years[years.length - 1])?.val, 0);
    const currentPrice = await fetchCurrentPrice(ticker);

    let previousRevenue = 0;
    const historicalFinancials = years.map((year) => {
      const revenue = safeNumber(revenueByYear.get(year)?.val);
      const grossProfit = safeNumber(grossProfitByYear.get(year)?.val);
      const operatingIncome = safeNumber(operatingIncomeByYear.get(year)?.val);
      const netIncome = safeNumber(netIncomeByYear.get(year)?.val);
      const operatingCashFlow = safeNumber(ocfByYear.get(year)?.val);
      const capex = safeNumber(capexByYear.get(year)?.val);
      const fcf = operatingCashFlow > 0 ? operatingCashFlow - Math.abs(capex) : revenue * 0.25;
      const sharesOutstanding = safeNumber(dilutedSharesByYear.get(year)?.val || latestSharesOutstanding, latestSharesOutstanding);
      const eps = safeNumber(epsByYear.get(year)?.val || (sharesOutstanding > 0 ? netIncome / sharesOutstanding : 0));
      const revenueGrowth = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;
      previousRevenue = revenue;

      return {
        year: `FY${String(year).slice(-2)}`,
        revenue: toMillions(revenue),
        revenueGrowth,
        grossProfit: toMillions(grossProfit),
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        ebitda: toMillions(operatingIncome),
        ebitdaMargin: revenue > 0 ? (operatingIncome / revenue) * 100 : 0,
        fcf: toMillions(fcf),
        fcfMargin: revenue > 0 ? (fcf / revenue) * 100 : 0,
        netIncome: toMillions(netIncome),
        netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
        eps,
      };
    });

    const latestYear = years[years.length - 1];
    const latestRevenue = safeNumber(revenueByYear.get(latestYear)?.val);
    const latestGrossProfit = safeNumber(grossProfitByYear.get(latestYear)?.val);
    const latestOperatingIncome = safeNumber(operatingIncomeByYear.get(latestYear)?.val);
    const latestNetIncome = safeNumber(netIncomeByYear.get(latestYear)?.val);
    const latestOcf = safeNumber(ocfByYear.get(latestYear)?.val);
    const latestCapex = safeNumber(capexByYear.get(latestYear)?.val);
    const latestFcf = latestOcf > 0 ? latestOcf - Math.abs(latestCapex) : latestRevenue * 0.25;
    const latestEps = safeNumber(epsByYear.get(latestYear)?.val || (latestSharesOutstanding > 0 ? latestNetIncome / latestSharesOutstanding : 0));
    const marketCap = currentPrice > 0 && latestSharesOutstanding > 0 ? currentPrice * latestSharesOutstanding : 0;

    return {
      fy24_financials: {
        revenue: latestRevenue,
        gross_profit: latestGrossProfit,
        gross_margin_pct: latestRevenue > 0 ? (latestGrossProfit / latestRevenue) * 100 : 0,
        operating_income: latestOperatingIncome,
        net_income: latestNetIncome,
        ebitda: latestOperatingIncome,
        ebitda_margin_pct: latestRevenue > 0 ? (latestOperatingIncome / latestRevenue) * 100 : 0,
        fcf: latestFcf,
        fcf_margin_pct: latestRevenue > 0 ? (latestFcf / latestRevenue) * 100 : 0,
        eps: latestEps,
        shares_outstanding: latestSharesOutstanding,
      },
      market_data: {
        current_price: currentPrice,
        market_cap: marketCap,
        enterprise_value: marketCap,
        pe_ratio: currentPrice > 0 && latestEps > 0 ? currentPrice / latestEps : 0,
        shares_outstanding: latestSharesOutstanding,
        net_debt: 0,
      },
      company_name: company.title || ticker,
      source: 'sec-stooq-fallback',
      currency_info: {
        original_currency: 'USD',
        converted_to_usd: false,
        conversion_rate: 1.0,
        exchange_rate_source: 'none',
      },
      historical_financials: historicalFinancials,
    };
  } catch (error) {
    console.warn(`[SEC Fallback] Failed for ${ticker}:`, error.message);
    return null;
  }
}
