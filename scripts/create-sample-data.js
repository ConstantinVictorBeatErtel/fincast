const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sampleData = {
  AAPL_metrics: {
    Symbol: 'AAPL',
    Revenue: 394328000000,
    NetIncome: 96995000000,
    Price: 175.04,
    MarketCapitalization: 2800000000000,
    PERatio: 28.5,
    ProfitMargin: 0.246,
    Date: new Date().toISOString()
  },
  MSFT_metrics: {
    Symbol: 'MSFT',
    Revenue: 198270000000,
    NetIncome: 72361000000,
    Price: 415.32,
    MarketCapitalization: 3080000000000,
    PERatio: 36.8,
    ProfitMargin: 0.365,
    Date: new Date().toISOString()
  }
};

Object.entries(sampleData).forEach(([filename, data]) => {
  const filePath = path.join(dataDir, filename + '.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log('Created sample file:', filePath);
});

console.log('Sample data created successfully!'); 