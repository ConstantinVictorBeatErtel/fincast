import { NextResponse } from 'next/server';

const SIMFIN_API_KEY = '1aab9692-30b6-4b82-be79-27d454de3b25';

// Remove edge runtime since we need Node.js features
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const path = require('path');

    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_company_data.py');
    const pythonProcess = spawn('python3', [scriptPath, ticker]);

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python script error:', error);
        resolve(NextResponse.json({ 
          error: 'Failed to execute Python script', 
          details: error 
        }, { status: 500 }));
        return;
      }

      try {
        const data = JSON.parse(output);
        resolve(NextResponse.json(data));
      } catch (error) {
        console.error('Failed to parse script output:', error);
        resolve(NextResponse.json({ 
          error: 'Failed to parse script output', 
          details: error.message,
          rawOutput: output
        }, { status: 500 }));
      }
    });
  });
}