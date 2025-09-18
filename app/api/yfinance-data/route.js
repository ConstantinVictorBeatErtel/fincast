import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker parameter is required' },
        { status: 400 }
      );
    }

    // If it's SPY and we have date parameters, use the integrated Python function
    if (ticker.toUpperCase() === 'SPY' && startDate && endDate) {
      return await fetchSpyData(startDate, endDate);
    }

    // For regular tickers, use the existing Python script
    return await fetchTickerData(ticker);

  } catch (error) {
    console.error('Error in yfinance-data API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function fetchSpyData(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'fetch_spy_data.py');
    
    const child = spawn('arch', ['-arm64', 'python3', pythonScript, startDate, endDate], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PATH: path.join(process.cwd(), 'venv', 'bin') + ':' + process.env.PATH.split(':').filter(p => !p.includes('Python.framework')).join(':')
      }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', errorOutput);
        reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        return;
      }

      try {
        // Parse the JSON output from Python script
        const lines = output.split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('{'));
        
        if (!jsonLine) {
          reject(new Error('No JSON output found from Python script'));
          return;
        }
        
        const spyData = JSON.parse(jsonLine);
        resolve(NextResponse.json(spyData));
        
      } catch (parseError) {
        console.error('Error parsing Python script output:', parseError);
        reject(parseError);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

async function fetchTickerData(ticker) {
  return new Promise((resolve, reject) => {
    // Use the existing Python yfinance script for regular tickers
    const pythonScript = path.join(process.cwd(), 'api', 'yfinance-data', 'index.py');
    
    const child = spawn('python3', [pythonScript], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, QUERY_STRING: `ticker=${ticker}` }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', errorOutput);
        reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        return;
      }

      try {
        const result = JSON.parse(output);
        resolve(NextResponse.json(result));
        
      } catch (parseError) {
        console.error('Error parsing Python script output:', parseError);
        reject(parseError);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}
