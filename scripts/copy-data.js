const fs = require('fs');
const path = require('path');

// Source and destination directories
const sourceDir = path.join(process.cwd(), '..', 'data');
const destDir = path.join(process.cwd(), 'public', 'data');

console.log('Current working directory:', process.cwd());
console.log('Source directory:', sourceDir);
console.log('Destination directory:', destDir);

// Check if source directory exists
if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory does not exist: ${sourceDir}`);
  console.log('Creating sample data for testing...');
  
  // Create sample data for testing
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
    }
  };

  // Create destination directory
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Write sample data
  Object.entries(sampleData).forEach(([filename, data]) => {
    const filePath = path.join(destDir, `${filename}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Created sample file: ${filePath}`);
  });
} else {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy all JSON files from source to destination
  try {
    const files = fs.readdirSync(sourceDir);
    console.log('Found files in source directory:', files);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const sourcePath = path.join(sourceDir, file);
        const destPath = path.join(destDir, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file} to public/data`);
      }
    });
    console.log('Data files copied successfully!');
  } catch (error) {
    console.error('Error copying data files:', error);
    process.exit(1);
  }
}

// Verify the files were copied
console.log('\nVerifying files in destination directory:');
if (fs.existsSync(destDir)) {
  const files = fs.readdirSync(destDir);
  console.log('Files in destination:', files);
} else {
  console.error('Destination directory not created!');
} 