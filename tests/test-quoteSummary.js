const yahooFinance = require('yahoo-finance2').default;

async function testQuoteSummary() {
  try {
    console.log('Testing quoteSummary...');
    
    // Test with income statement history
    console.log('\n1. Testing income statement history...');
    const incomeData = await yahooFinance.quoteSummary('AAPL', {
      modules: ['incomeStatementHistory']
    });
    console.log('Income statement data:', incomeData);
    
    // Test with balance sheet history
    console.log('\n2. Testing balance sheet history...');
    const balanceData = await yahooFinance.quoteSummary('AAPL', {
      modules: ['balanceSheetHistory']
    });
    console.log('Balance sheet data:', balanceData);
    
    // Test with default key statistics
    console.log('\n3. Testing default key statistics...');
    const statsData = await yahooFinance.quoteSummary('AAPL', {
      modules: ['defaultKeyStatistics']
    });
    console.log('Default key statistics:', statsData);
    
    // Test with all modules
    console.log('\n4. Testing all available modules...');
    const allData = await yahooFinance.quoteSummary('AAPL', {
      modules: ['incomeStatementHistory', 'balanceSheetHistory', 'defaultKeyStatistics', 'summaryDetail']
    });
    console.log('All modules data keys:', Object.keys(allData));
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testQuoteSummary(); 