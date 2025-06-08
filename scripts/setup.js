const fs = require('fs');
const path = require('path');

// Create data directories
const dataDir = path.join(process.cwd(), 'public', 'data');
const simfinDir = path.join(process.cwd(), 'data', 'simfin');

// Create directories if they don't exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(simfinDir)) {
  fs.mkdirSync(simfinDir, { recursive: true });
}

console.log('Created data directories:', { dataDir, simfinDir }); 