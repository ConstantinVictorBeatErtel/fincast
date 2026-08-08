export function formatCurrency(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `$${value.toFixed(2)}`;
}

export function formatMillions(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `$${value.toFixed(1)}M`;
}

export function formatFairEVMillions(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `$${(value * 1000).toFixed(1)}M`;
}

export function formatCurrentEVMillions(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `$${value.toFixed(1)}M`;
}

export function calculateCAGR(currentPrice, fairValue, years = 5) {
  if (!currentPrice || !fairValue || currentPrice <= 0 || fairValue <= 0) return 0;
  return (Math.pow(fairValue / currentPrice, 1 / years) - 1) * 100;
}

export function formatPercentage(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

export function formatDCFPercentage(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatExitMultiplePercentage(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

export function formatMultiple(value) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  return `${value.toFixed(1)}x`;
}

export function formatOneDecimal(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return '0.0';
  return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatYearAsFY(year) {
  const s = String(year || '').trim();
  if (s.toUpperCase().startsWith('FY')) return s;
  const m = s.match(/(20\d{2})/);
  if (m) return `FY${m[1].slice(2)}`;
  return s;
}

export function getYearNumber(year) {
  const s = String(year || '').trim();
  if (s.toUpperCase().startsWith('FY')) {
    const num = parseInt(s.slice(2), 10);
    return num < 100 ? 2000 + num : num;
  }
  const m = s.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}

export function getSortedHistorical(arr) {
  if (!Array.isArray(arr)) return [];
  const toYearNum = (y) => {
    const s = String(y || '').trim();
    if (s.startsWith('FY')) return parseInt(s.slice(2), 10) || 0;
    const m = s.match(/\d{4}/);
    if (m) return parseInt(m[0].slice(2), 10) || 0;
    return 0;
  };
  return [...arr].sort((a, b) => toYearNum(a.year) - toYearNum(b.year));
}
