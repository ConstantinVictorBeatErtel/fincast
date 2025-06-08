import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  const pythonPath = '/usr/local/bin/python3';
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_company_data.py');

  return new Promise((resolve) => {
    const pythonProcess = spawn(pythonPath, [scriptPath, ticker], {
      env: {
        ...process.env,
        PYTHONPATH: '/usr/local/lib/python3.12/site-packages',
        PYTHONNOUSERSITE: '1'
      }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Script stderr:', stderr);
        resolve(NextResponse.json({ 
          error: 'Failed to execute Python script', 
          details: stderr 
        }, { status: 500 }));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve(NextResponse.json(data));
      } catch (error) {
        console.error('Failed to parse script output:', error);
        resolve(NextResponse.json({ 
          error: 'Failed to parse script output', 
          details: error.message 
        }, { status: 500 }));
      }
    });
  });
}