import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  // In Vercel, Python is available at /usr/local/bin/python3
  const pythonPath = process.env.VERCEL ? '/usr/local/bin/python3' : 'python3';
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_company_data.py');

  return new Promise((resolve) => {
    console.log('Starting Python process with:', {
      pythonPath,
      scriptPath,
      ticker,
      cwd: process.cwd()
    });

    const pythonProcess = spawn(pythonPath, [scriptPath, ticker], {
      env: {
        ...process.env,
        PYTHONPATH: process.env.VERCEL 
          ? '/usr/local/lib/python3.12/site-packages'
          : path.join(process.cwd(), 'venv', 'lib', 'python3.12', 'site-packages'),
        PYTHONNOUSERSITE: '1'
      }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log('Python stdout:', chunk);
      stdout += chunk;
    });

    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.error('Python stderr:', chunk);
      stderr += chunk;
    });

    pythonProcess.on('close', (code) => {
      console.log('Python process exited with code:', code);
      
      if (code !== 0) {
        console.error('Script stderr:', stderr);
        resolve(NextResponse.json({ 
          error: 'Failed to execute Python script', 
          details: stderr || 'No error details available'
        }, { status: 500 }));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve(NextResponse.json(data));
      } catch (error) {
        console.error('Failed to parse script output:', error);
        console.error('Raw stdout:', stdout);
        resolve(NextResponse.json({ 
          error: 'Failed to parse script output', 
          details: error.message,
          rawOutput: stdout
        }, { status: 500 }));
      }
    });
  });
}