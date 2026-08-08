const yahooFinance = require('yahoo-finance2').default;

async function testYahooFinance() {
  try {
    console.log('Testing yahoo-finance2...');
    
    // Test basic quote
    console.log('\n1. Testing quote...');
    const quote = await yahooFinance.quote('AAPL');
    console.log('Quote successful:', {
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      marketCap: quote.marketCap
    });
    
    // Check what methods are available
    console.log('\n2. Available methods on yahooFinance:');
    console.log(Object.getOwnPropertyNames(yahooFinance).filter(name => typeof yahooFinance[name] === 'function'));
    
    // Test historical data
    console.log('\n3. Testing historical data...');
    const historical = await yahooFinance.historical('AAPL', {
      period1: '2024-01-01',
      period2: '2024-12-31',
      interval: '1mo'
    });
    console.log('Historical data successful, got', historical.length, 'records');
    
    // Test income statement
    console.log('\n4. Testing income statement...');
    try {
      const incomeStmt = await yahooFinance.incomeStatement('AAPL');
      console.log('Income statement successful, got', incomeStmt.length, 'records');
      if (incomeStmt.length > 0) {
        console.log('Latest year data:', {
          totalRevenue: incomeStmt[0].totalRevenue,
          grossProfit: incomeStmt[0].grossProfit,
          netIncome: incomeStmt[0].netIncome
        });
      }
    } catch (incomeError) {
      console.log('Income statement failed:', incomeError.message);
    }
    
    // Test balance sheet
    console.log('\n5. Testing balance sheet...');
    try {
      const balanceSheet = await yahooFinance.balanceSheet('AAPL');
      console.log('Balance sheet successful, got', balanceSheet.length, 'records');
    } catch (balanceError) {
      console.log('Balance sheet failed:', balanceError.message);
    }
    
    // Test cash flow
    console.log('\n6. Testing cash flow...');
    try {
      const cashFlow = await yahooFinance.cashFlow('AAPL');
      console.log('Cash flow successful, got', cashFlow.length, 'records');
    } catch (cashError) {
      console.log('Cash flow failed:', cashError.message);
    }
    
    console.log('\nTest completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testYahooFinance(); 