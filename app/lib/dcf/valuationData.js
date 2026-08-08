export function isValuationIncomplete(data) {
  if (!data) return true;
  if (Array.isArray(data.projections) && data.projections.length > 0) return false;
  if (typeof data.rawForecast === 'string' && data.rawForecast.trim().length > 0) return false;
  return (!data.currentSharePrice || data.currentSharePrice === 0 || !data.fairValue || data.fairValue === 0);
}

export function getNestedValue(obj, path, defaultValue = 'N/A') {
  try {
    const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    return value;
  } catch (error) {
    console.error(`Error accessing path ${path}:`, error);
    return defaultValue;
  }
}

function mapTableRow(row) {
  const revenue = Number(row.revenue || 0);
  const grossMargin = Number(row.grossMargin || 0);
  const ebitdaMargin = Number(row.ebitdaMargin || 0);
  const fcfMargin = Number(row.fcfMargin || 0);
  const netIncome = Number(row.netIncome || 0);
  return {
    year: String(row.year || ''),
    revenue,
    revenueGrowth: Number(row.revenueGrowth || 0),
    grossProfit: revenue * (grossMargin / 100),
    grossMargin,
    ebitda: revenue * (ebitdaMargin / 100),
    ebitdaMargin,
    freeCashFlow: revenue * (fcfMargin / 100),
    fcf: revenue * (fcfMargin / 100),
    fcfMargin,
    netIncome,
    netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
    eps: Number(row.eps || 0),
  };
}

function parseRawForecastTable(rawForecast) {
  const lines = rawForecast.split('\n').map((l) => l.trim()).filter(Boolean);
  let inTable = false;
  const parsed = [];
  for (const line of lines) {
    if (!inTable) {
      if (/^Year\s*\|/i.test(line)) inTable = true;
      continue;
    }
    if (/^-{2,}/.test(line)) continue;
    if (/^Fair Value Calculation:/i.test(line) || /^Exit Multiple Valuation:/i.test(line)) break;
    const cols = line.split('|').map((c) => c.trim());
    if (!cols.length || isNaN(Number(cols[0].replace(/[^\d]/g, '')))) continue;
    const parseNum = (v) => {
      if (!v) return 0;
      const n = Number(String(v).replace(/[^\d.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const year = cols[0];
    const revenue = parseNum(cols[1]);
    const revenueGrowth = parseNum(cols[2]);
    const grossMargin = parseNum(cols[3]);
    const ebitdaMargin = parseNum(cols[4]);
    const fcfMargin = parseNum(cols[5]);
    const netIncome = parseNum(cols[6]);
    const eps = parseNum(cols[7]);
    parsed.push({
      year,
      revenue,
      revenueGrowth,
      grossProfit: revenue * (grossMargin / 100),
      grossMargin,
      ebitda: revenue * (ebitdaMargin / 100),
      ebitdaMargin,
      freeCashFlow: revenue * (fcfMargin / 100),
      fcf: revenue * (fcfMargin / 100),
      fcfMargin,
      netIncome,
      netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
      eps,
    });
  }
  return parsed;
}

export function normalizeValuationProjections(data) {
  if (!data) return data;

  try {
    if (!Array.isArray(data.projections) || data.projections.length === 0) {
      if (Array.isArray(data.tableData) && data.tableData.length > 0) {
        data.projections = data.tableData.map(mapTableRow);
      } else if (typeof data.rawForecast === 'string') {
        const parsed = parseRawForecastTable(data.rawForecast);
        if (parsed.length > 0) data.projections = parsed;
      }
    }

    if (data.source === 'agentic' && Array.isArray(data.projections)) {
      data.projections = data.projections.map((row) => {
        const revenue = Number(row.revenue || 0);
        const grossMargin = Number(row.grossMargin || 0);
        const ebitdaMargin = Number(row.ebitdaMargin || 0);
        const fcfMargin = Number(row.fcfMargin || 0);
        const netIncome = Number(row.netIncome || 0);

        return {
          ...row,
          year: String(row.year || ''),
          revenue,
          revenueGrowth: Number(row.revenueGrowth || 0),
          grossProfit: row.grossProfit || revenue * (grossMargin / 100),
          grossMargin,
          ebitda: row.ebitda || revenue * (ebitdaMargin / 100),
          ebitdaMargin,
          freeCashFlow: row.freeCashFlow || row.fcf || revenue * (fcfMargin / 100),
          fcf: row.fcf || row.freeCashFlow || revenue * (fcfMargin / 100),
          fcfMargin,
          netIncome,
          netIncomeMargin: row.netIncomeMargin || (revenue > 0 ? (netIncome / revenue) * 100 : 0),
          eps: Number(row.eps || 0),
        };
      });
    }
  } catch (normErr) {
    console.warn('Projection normalization failed:', normErr);
  }

  return data;
}

export function alignProjectionWithHistorical2024(data) {
  if (!data) return data;

  try {
    if (Array.isArray(data.projections) && data.projections.length > 0 && Array.isArray(data.historicalFinancials)) {
      const hist24 = data.historicalFinancials.find(
        (h) => String(h.year).toUpperCase().includes('FY24') || String(h.year).includes('2024')
      );
      const idx2024 = data.projections.findIndex((p) => String(p.year) === '2024');
      if (hist24 && idx2024 !== -1) {
        const rev = Number(hist24.revenue || 0);
        const gp = Number(hist24.grossProfit || 0);
        const ebitda = Number(hist24.ebitda || 0);
        const ni = Number(hist24.netIncome || 0);
        const fcf = Number(hist24.fcf || 0);
        const eps = Number(hist24.eps || 0);
        data.projections[idx2024] = {
          ...data.projections[idx2024],
          revenue: rev,
          grossProfit: gp,
          grossMargin: rev > 0 ? (gp / rev) * 100 : 0,
          ebitda,
          ebitdaMargin: rev > 0 ? (ebitda / rev) * 100 : 0,
          freeCashFlow: fcf,
          fcf,
          fcfMargin: rev > 0 ? (fcf / rev) * 100 : 0,
          netIncome: ni,
          netIncomeMargin: rev > 0 ? (ni / rev) * 100 : 0,
          eps,
          revenueGrowth:
            typeof hist24.revenueGrowth === 'number'
              ? Number(hist24.revenueGrowth)
              : data.projections[idx2024].revenueGrowth || 0,
        };
      }
    }
  } catch (alignErr) {
    console.warn('Failed to align 2024 projection with historical:', alignErr);
  }

  return data;
}

export function hasUsableForecast(newValuation) {
  const isAgenticUsable =
    newValuation?.source === 'agentic' &&
    Array.isArray(newValuation.projections) &&
    newValuation.projections.length > 0;

  return (
    isAgenticUsable ||
    (!!newValuation?.rawForecast &&
      (newValuation.rawForecast.includes('Year | Revenue') ||
        (Array.isArray(newValuation.tableData) && newValuation.tableData.length > 0) ||
        (newValuation.sections &&
          (!!newValuation.sections.forecastTable ||
            !!newValuation.sections.fairValueCalculation ||
            !!newValuation.sections.exitMultipleValuation ||
            !!newValuation.sections.assumptions ||
            !!newValuation.sections.financialAnalysis))))
  );
}

export function filterLatestDevelopments(text) {
  if (!text || typeof text !== 'string') return '';

  let filtered = text;
  filtered = filtered.replace(/Historical\s+Analysis\s*&\s*Projections[\s\S]*?(?=\n\n|\n\*|\n$)/gi, '');
  filtered = filtered.replace(/Assumptions\s+and\s+Justifications[\s\S]*?(?=\n\n|\n\*|\n$)/gi, '');
  filtered = filtered.replace(/\n\n\n+/g, '\n\n');
  return filtered.trim();
}

export function shouldShowEVDisplay(method, valuation) {
  return (
    method === 'exit-multiple' &&
    valuation?.exitMultipleType &&
    (valuation.exitMultipleType === 'EV/EBITDA' || valuation.exitMultipleType === 'EV/FCF')
  );
}

export function prepareValuationResponse(data) {
  normalizeValuationProjections(data);
  alignProjectionWithHistorical2024(data);
  return data;
}
