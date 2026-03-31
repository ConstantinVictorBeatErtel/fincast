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
    const currentPrice = await fetchCurrentPriceFromStooq(ticker);

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
