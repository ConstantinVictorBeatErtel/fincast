import { NextResponse } from 'next/server';
import { PythonShell } from 'python-shell';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  return new Promise((resolve) => {
    const options = {
      mode: 'text',
      pythonPath: process.env.VERCEL ? '/usr/local/bin/python3' : 'python3',
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