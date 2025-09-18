const { spawn } = require('child_process');
const path = require('path');

// Test the Python script output
console.log('Testing Python script output...');

const pythonScript = spawn('arch', [
  '-arm64',
  path.join(process.cwd(), 'venv', 'bin', 'python'),
  path.join(process.cwd(), 'scripts', 'fetch_spy_data.py'),
  '2020-09-04',
  '2025-09-02'
], {
  cwd: process.cwd(),
  env: { 
    ...process.env, 
    PATH: path.join(process.cwd(), 'venv', 'bin') + ':' + process.env.PATH.split(':').filter(p => !p.includes('Python.framework')).join(':')
  }
});

let output = '';
let errorOutput = '';

pythonScript.stdout.on('data', (data) => {
  output += data.toString();
});

pythonScript.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

      pythonScript.on('close', (code) => {
        if (code !== 0) {
          console.error('Python script error:', errorOutput);
          return;
        }
        
        try {
          // Extract JSON from the output (it's at the end after all the debug prints)
          const lines = output.split('\n');
          const jsonLine = lines.find(line => line.trim().startsWith('{'));
          
          if (!jsonLine) {
            throw new Error('No JSON output found from Python script');
          }
          
          const spyData = JSON.parse(jsonLine);
          console.log('SPY data length:', spyData.returns.length);
          console.log('SPY returns sample:', spyData.returns.slice(0, 5));
          console.log('SPY returns last 5:', spyData.returns.slice(-5));
          console.log('SPY variance:', spyData.variance);
          console.log('SPY mean return:', spyData.mean_return);
          
          // Test some simple calculations
          const spyReturns = spyData.returns;
          const mean = spyReturns.reduce((sum, val) => sum + val, 0) / spyReturns.length;
          const variance = spyReturns.reduce((sum, val) => sum + (val - mean) ** 2, 0) / spyReturns.length;
          
          console.log('Calculated mean:', mean);
          console.log('Calculated variance:', variance);
          
        } catch (parseError) {
          console.error('Error parsing Python script output:', parseError);
          console.log('Raw output:', output);
        }
      });
