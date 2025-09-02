// Quick inspection script for yahoo-finance2 modules
import yahooFinance from 'yahoo-finance2';

async function run(symbol = 'AAPL') {
  const modules = [
    'incomeStatementHistory',
    'incomeStatementHistoryQuarterly',
    'cashflowStatementHistory',
    'cashflowStatementHistoryQuarterly',
    'balanceSheetHistory',
    'balanceSheetHistoryQuarterly',
  ];
  const data = await yahooFinance.quoteSummary(symbol, { modules });
  const incomeAnnual = await yahooFinance.incomeStatement(symbol).catch(()=>null);
  const cashflowAnnual = await yahooFinance.cashflowStatement(symbol).catch(()=>null);
  const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj?.[k]]));
  const is = data.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
  const isQ = data.incomeStatementHistoryQuarterly?.incomeStatementHistory?.[0] || {};
  const cf = data.cashflowStatementHistory?.cashflowStatements?.[0] || {};
  const cfQ = data.cashflowStatementHistoryQuarterly?.cashflowStatements?.[0] || {};
  const bs = data.balanceSheetHistory?.balanceSheetStatements?.[0] || {};
  const bsQ = data.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] || {};

  console.log('INCOME (annual) keys:', Object.keys(is));
  console.log('CASHFLOW (annual) keys:', Object.keys(cf));
  console.log('BALANCE (annual) keys:', Object.keys(bs));
  console.log('INCOME (quarterly) sample:', pick(isQ, ['endDate','totalRevenue','costOfRevenue','grossProfit','ebit','operatingIncome','netIncome','dilutedEPS','basicEPS','dilutedAverageShares','basicAverageShares']));
  console.log('CASHFLOW (quarterly) sample:', pick(cfQ, ['endDate','totalCashFromOperatingActivities','operatingCashflow','capitalExpenditures','depreciation','depreciationAndAmortization']));
  if (Array.isArray(incomeAnnual) && incomeAnnual.length) {
    console.log('incomeStatement() first item keys:', Object.keys(incomeAnnual[0]));
    console.log('incomeStatement() first item sample:', pick(incomeAnnual[0], ['endDate','TotalRevenue','GrossProfit','EBITDA','OperatingIncome','NetIncome']));
  } else {
    console.log('incomeStatement() returned empty');
  }
  if (Array.isArray(cashflowAnnual) && cashflowAnnual.length) {
    console.log('cashflowStatement() first item keys:', Object.keys(cashflowAnnual[0]));
    console.log('cashflowStatement() first item sample:', pick(cashflowAnnual[0], ['endDate','TotalCashFromOperatingActivities','CapitalExpenditure','DepreciationAmortization']));
  } else {
    console.log('cashflowStatement() returned empty');
  }
}

const sym = process.argv[2] || 'AAPL';
run(sym).catch(err => {
  console.error(err);
  process.exit(1);
});


