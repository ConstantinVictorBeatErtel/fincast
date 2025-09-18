const yahooFinance = require('yahoo-finance2').default;

async function testAppleData() {
  try {
    console.log('Testing Apple data...');
    
    // Test key stats
    const quote = await yahooFinance.quoteSummary('AAPL', {
      modules: ['defaultKeyStatistics']
    });
    
    console.log('Key stats available fields:', Object.keys(quote.defaultKeyStatistics || {}));
    console.log('Key stats:', {
      sharesOutstanding: quote.defaultKeyStatistics?.sharesOutstanding,
      marketCap: quote.defaultKeyStatistics?.marketCap,
      trailingPE: quote.defaultKeyStatistics?.trailingPE,
      forwardPE: quote.defaultKeyStatistics?.forwardPE,
      enterpriseValue: quote.defaultKeyStatistics?.enterpriseValue,
      totalAssets: quote.defaultKeyStatistics?.totalAssets
    });
    
    // Test income statement (annual)
    const incomeQuote = await yahooFinance.quoteSummary('AAPL', {
      modules: ['incomeStatementHistory']
    });
    
    // Test income statement (quarterly)
    const quarterlyQuote = await yahooFinance.quoteSummary('AAPL', {
      modules: ['incomeStatementHistoryQuarterly']
    });
    
    const incomeHistory = incomeQuote.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterlyHistory = quarterlyQuote.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    
    console.log('Annual income history length:', incomeHistory.length);
    console.log('Quarterly income history length:', quarterlyHistory.length);
    
    if (incomeHistory.length > 0) {
      console.log('Latest annual income statement:', {
        endDate: incomeHistory[0].endDate,
        totalRevenue: incomeHistory[0].totalRevenue,
        netIncome: incomeHistory[0].netIncome,
        sharesOutstanding: incomeHistory[0].sharesOutstanding
      });
    }
    
    if (quarterlyHistory.length > 0) {
      console.log('Latest 4 quarterly income statements:');
      quarterlyHistory.slice(0, 4).forEach((quarter, index) => {
        console.log(`Q${index + 1}:`, {
          endDate: quarter.endDate,
          totalRevenue: quarter.totalRevenue,
          netIncome: quarter.netIncome,
          sharesOutstanding: quarter.sharesOutstanding
        });
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testAppleData();
