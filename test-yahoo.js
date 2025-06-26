const yahooFinance = require('yahoo-finance2').default;

async function testYahooFinance() {
  try {
    console.log('Testing Yahoo Finance API...');
    
    // Test quote
    console.log('\n1. Testing quote...');
    const quote = await yahooFinance.quote('AAPL');
    console.log('Quote data:', {
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      marketCap: quote.marketCap,
      eps: quote.epsTrailingTwelveMonths,
      pe: quote.trailingPE,
      dividendYield: quote.dividendYield
    });
    
    // Test historical data
    console.log('\n2. Testing historical data...');
    const historical = await yahooFinance.historical('AAPL', {
      period1: '2024-01-01',
      period2: '2024-03-01',
      interval: '1d'
    });
    console.log('Historical data sample:', historical[0]);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testYahooFinance(); 