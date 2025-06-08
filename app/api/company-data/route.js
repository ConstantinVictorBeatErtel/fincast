import { NextResponse } from 'next/server';
import { PythonShell } from 'python-shell';
import path from 'path';

// Mock data for when Python is not available
const mockData = {
  "2023": {
    "Revenue": 394328000000,
    "Net Income": 96995000000
  },
  "2022": {
    "Revenue": 394328000000,
    "Net Income": 99803000000
  },
  "2021": {
    "Revenue": 365817000000,
    "Net Income": 94680000000
  }
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  // Check if we're in Vercel's environment
  if (process.env.VERCEL) {
    console.log('Running in Vercel environment, using mock data');
    return NextResponse.json(mockData);
  }

  // Local development - try to use Python
  return new Promise((resolve) => {
    const options = {
      mode: 'text',
      pythonPath: 'python3',
      pythonOptions: ['-u'], // unbuffered output
      scriptPath: path.join(process.cwd(), 'scripts'),
      args: [ticker]
    };

    PythonShell.run('fetch_company_data.py', options)
      .then(results => {
        try {
          const data = JSON.parse(results[0]);
          resolve(NextResponse.json(data));
        } catch (error) {
          console.error('Failed to parse script output:', error);
          resolve(NextResponse.json({ 
            error: 'Failed to parse script output', 
            details: error.message,
            rawOutput: results[0]
          }, { status: 500 }));
        }
      })
      .catch(error => {
        console.error('Python script error:', error);
        resolve(NextResponse.json({ 
          error: 'Failed to execute Python script', 
          details: error.message 
        }, { status: 500 }));
      });
  });
}