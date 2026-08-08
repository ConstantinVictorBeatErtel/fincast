import * as XLSX from 'xlsx';

export function downloadValuationExcel(valuation) {
  if (!valuation) {
    console.error('No valuation data available');
    return;
  }

  const workbook = XLSX.utils.book_new();

  const impliedFairSharePrice =
    valuation.method === 'exit-multiple' &&
    typeof valuation.currentSharePrice === 'number' &&
    typeof valuation.upside === 'number'
      ? valuation.currentSharePrice * (1 + valuation.upside / 100)
      : null;

  const summaryData = [
    ['Valuation Summary'],
    ['Company', valuation.companyName],
    ['Method', valuation.method],
    [
      'Fair Value',
      valuation.method === 'exit-multiple'
        ? impliedFairSharePrice
          ? `$${impliedFairSharePrice.toFixed(2)} per share`
          : 'N/A'
        : `$${valuation.fairValue?.toLocaleString()} million`,
    ],
    ['Upside', `${valuation.upside?.toFixed(1) || 0}%`],
    ['2029 Upside', `${valuation.upside?.toFixed(1) || 0}%`],
    ['Upside CAGR', `${valuation.cagr?.toFixed(1) || 0}%`],
    ['Confidence', valuation.confidence || 'Medium'],
    [],
  ];

  if (valuation.method === 'dcf') {
    summaryData.push(
      ['DCF Assumptions'],
      ['Discount Rate', `${valuation.discountRate}%`],
      ['Terminal Growth Rate', `${valuation.terminalGrowth}%`]
    );
  } else if (valuation.method === 'exit-multiple') {
    summaryData.push(
      ['Exit Multiple Assumptions'],
      ['Exit Multiple Type', valuation.exitMultipleType],
      ['Exit Multiple Value', `${valuation.exitMultipleValue}x`],
      ['Current Share Price', `$${valuation.currentSharePrice?.toFixed(2)}`]
    );
  }

  const sheets = [{ name: 'Summary', data: summaryData }];

  try {
    const hist = Array.isArray(valuation.historicalFinancials) ? [...valuation.historicalFinancials] : [];
    hist.sort((a, b) => {
      const ay = String(a.year || '').replace(/^FY/, '');
      const by = String(b.year || '').replace(/^FY/, '');
      return parseInt(ay, 10) - parseInt(by, 10);
    });
    const proj = Array.isArray(valuation.projections) ? valuation.projections : [];

    const normalizeYearLabel = (y) => {
      const s = String(y || '');
      const m = s.match(/(20\d{2})/);
      if (m) return `FY${m[1].slice(2)}`;
      if (s.toUpperCase().startsWith('FY')) return s;
      return s;
    };
    const histLabels = hist.map((h) => normalizeYearLabel(h.year));
    const histLabelSet = new Set(histLabels);
    const projFiltered = proj.filter((p) => !histLabelSet.has(normalizeYearLabel(p.year)));

    const headers = ['Metric', ...histLabels, ...projFiltered.map((p) => normalizeYearLabel(p.year))];
    const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '');
    const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '');

    sheets.push({
      name: 'Performance',
      data: [
        headers,
        ['Revenue ($M)', ...hist.map((h) => fmt1(h.revenue)), ...projFiltered.map((p) => fmt1(p.revenue))],
        [
          'Revenue Growth (%)',
          ...hist.map((h, i) => (i === 0 ? '/' : fmt1(h.revenueGrowth))),
          ...projFiltered.map((p) => fmt1(p.revenueGrowth)),
        ],
        ['Gross Profit ($M)', ...hist.map((h) => fmt1(h.grossProfit)), ...projFiltered.map((p) => fmt1(p.grossProfit))],
        ['Gross Margin (%)', ...hist.map((h) => fmt1(h.grossMargin)), ...projFiltered.map((p) => fmt1(p.grossMargin))],
        ['EBITDA ($M)', ...hist.map((h) => fmt1(h.ebitda)), ...projFiltered.map((p) => fmt1(p.ebitda))],
        ['EBITDA Margin (%)', ...hist.map((h) => fmt1(h.ebitdaMargin)), ...projFiltered.map((p) => fmt1(p.ebitdaMargin))],
        ['Net Income ($M)', ...hist.map((h) => fmt1(h.netIncome)), ...projFiltered.map((p) => fmt1(p.netIncome))],
        [
          'Net Income Margin (%)',
          ...hist.map((h) => fmt1(h.netIncomeMargin)),
          ...projFiltered.map((p) => fmt1(p.netIncomeMargin)),
        ],
        ['EPS ($)', ...hist.map((h) => fmt2(h.eps)), ...projFiltered.map((p) => fmt2(p.eps))],
        ['FCF ($M)', ...hist.map((h) => fmt1(h.fcf)), ...projFiltered.map((p) => fmt1(p.fcf))],
        ['FCF Margin (%)', ...hist.map((h) => fmt1(h.fcfMargin)), ...projFiltered.map((p) => fmt1(p.fcfMargin))],
      ],
    });
  } catch (e) {
    console.warn('Failed to build Performance sheet:', e);
  }

  const analysisData = [];
  if (valuation.sections?.financialAnalysis) {
    analysisData.push(
      ['Financial Analysis'],
      [valuation.sections.financialAnalysis.split('\n').slice(0, 10).join('\n')],
      []
    );
  }
  if (valuation.sections?.assumptions) {
    analysisData.push(
      ['Assumptions and Justifications'],
      [valuation.sections.assumptions.split('\n').slice(0, 8).join('\n')]
    );
  }
  if (analysisData.length > 0) {
    sheets.push({ name: 'Analysis', data: analysisData });
  }

  try {
    const lastProj =
      Array.isArray(valuation.projections) && valuation.projections.length
        ? valuation.projections[valuation.projections.length - 1]
        : null;
    const calcRows = [];
    if (valuation.method === 'exit-multiple') {
      const type = valuation.exitMultipleType || 'P/E';
      const multiple = valuation.exitMultipleValue || 0;
      if (type === 'P/E' && lastProj) {
        const eps = Number(lastProj.eps || 0);
        const fair = eps * multiple;
        calcRows.push(['Calculation Details'], [`Fair Price = 2029 EPS × Multiple`], [`= ${eps.toFixed(2)} × ${multiple} = $${fair.toFixed(2)} per share`]);
      } else if (type === 'EV/EBITDA' && lastProj) {
        const ebitda = Number(lastProj.ebitda || 0);
        const fairEV = ebitda * multiple;
        calcRows.push(['Calculation Details'], [`Fair EV ($M) = 2029 EBITDA × Multiple`], [`= ${ebitda.toFixed(1)} × ${multiple} = $${fairEV.toFixed(1)}M`]);
        const evM = Number(valuation.sourceMetrics?.enterpriseValue || 0);
        const mktCap = Number(valuation.sourceMetrics?.marketCap || 0);
        const mktCapM = mktCap ? mktCap / 1_000_000 : 0;
        const netDebtM = evM && mktCapM ? evM - mktCapM : null;
        const shares = Number(valuation.sourceMetrics?.sharesOutstanding || 0);
        const sharesM = shares > 1000 ? shares / 1_000_000 : shares;
        if (netDebtM != null && sharesM > 0) {
          const equityM = fairEV - netDebtM;
          const price = (equityM * 1_000_000) / (sharesM * 1_000_000);
          calcRows.push([
            `Implied Equity ($M) = Fair EV − Net Debt = ${fairEV.toFixed(1)} − ${netDebtM.toFixed(1)} = ${equityM.toFixed(1)}M`,
          ]);
          calcRows.push([`Implied Price = Implied Equity / Shares = ${equityM.toFixed(1)}M / ${sharesM.toFixed(1)}M = $${price.toFixed(2)} per share`]);
        }
      } else if (type === 'EV/FCF' && lastProj) {
        const fcf = Number(lastProj.fcf || lastProj.freeCashFlow || 0);
        const fairEV = fcf * multiple;
        calcRows.push(['Calculation Details'], [`Fair EV ($M) = 2029 FCF × Multiple`], [`= ${fcf.toFixed(1)} × ${multiple} = $${fairEV.toFixed(1)}M`]);
      }
    } else if (valuation.method === 'dcf' && lastProj && typeof valuation.fairValue === 'number') {
      calcRows.push(['Calculation Details'], [`DCF Fair Value ($M): ${valuation.fairValue.toFixed(1)} (see app for full breakdown)`]);
    }
    if (calcRows.length) {
      sheets[0].data.push([]);
      sheets[0].data.push(...calcRows);
    }
  } catch (calcErr) {
    console.warn('Failed to add calculation details:', calcErr);
  }

  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const fileName = `${valuation.companyName}_Valuation_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
