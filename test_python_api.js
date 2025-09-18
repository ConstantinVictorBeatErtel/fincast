const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Python script execution...');

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
  console.log('Exit code:', code);
  if (code !== 0) {
    console.error('Error output:', errorOutput);
  } else {
    console.log('Success! Output:', output.slice(-200));
  }
});
