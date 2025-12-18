import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request) {
  try {
    const { ticker, years = 5 } = await request.json();

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching historical valuation data for ${ticker} via Python script...`);

    const historicalData = await fetchHistoricalValuationFromPython(ticker);

    if (!historicalData || historicalData.length === 0 || historicalData.error) {
      return NextResponse.json(
        {
          error: 'No historical valuation data found',
          details: historicalData?.debug || 'Unknown error',
          stdout: historicalData?.stdout ? historicalData.stdout.substring(0, 200) : 'N/A'
        },
        { status: 404 }
      );
    }

    // Determine start/end date from the data itself
    const dates = historicalData.map(d => new Date(d.date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      data: historicalData,
      period: {
        startDate: minDate.toISOString().split('T')[0],
        endDate: maxDate.toISOString().split('T')[0],
        years: years
      }
    });

  } catch (error) {
    console.error('Historical valuation error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch historical valuation data: ' + error.message },
      { status: 500 }
    );
  }
}

async function fetchHistoricalValuationFromPython(ticker) {
  return new Promise((resolve, reject) => {
    const pythonCmd = path.join(process.cwd(), 'venv', 'bin', 'python3');
    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_yfinance.py');

    // Check for macOS ARM/Rosetta mismatch
    // If Node is x64 (Rosetta) on Apple Silicon, we might need to force arch
    const isDarwin = process.platform === 'darwin';
    const isNodeX64 = process.arch === 'x64';

    // We assume the system is capable of arm64 if it's Darwin. 
    // This logic attempts to run python in arm64 mode if we are on a Mac, 
    // minimizing issues if venv was created natively but node is emulated.
    const cmd = (isDarwin && isNodeX64) ? '/usr/bin/arch' : pythonCmd;
    const args = (isDarwin && isNodeX64)
      ? ['-arm64', pythonCmd, scriptPath, ticker, '--valuation']
      : [scriptPath, ticker, '--valuation'];

    // If using direct python command (not via arch), set as command
    let spawnCmd = cmd;
    let spawnArgs = args;

    // If we are NOT using arch wrapper, we need to pass args correctly (cmd is python, args start with script)
    if (cmd === pythonCmd) {
      spawnArgs = [scriptPath, ticker, '--valuation'];
    }

    console.log(`[Historical] Spawning: ${spawnCmd} ${spawnArgs.join(' ')}`);

    const pythonProcess = spawn(spawnCmd, spawnArgs);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
      // Keep distinct logs but don't clutter console unless error
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`Stderr: ${errorData}`);
        resolve([]); // Return empty array on failure instead of rejecting to handle gracefully
        return;
      }

      try {
        // Find the last valid JSON object in the output (in case of debug logs)
        // The script prints one JSON object at the end
        const lines = outputData.trim().split('\n');
        let jsonData = null;

        // Try parsing from the last line backwards
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const potentialJson = JSON.parse(lines[i]);
            if (Array.isArray(potentialJson)) {
              jsonData = potentialJson;
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (jsonData) {
          resolve(jsonData);
        } else {
          console.error('Failed to parse Python output as JSON:', outputData);
          resolve({ error: 'Parse failed', debug: 'Failed to parse JSON', stdout: outputData, stderr: errorData });
        }
      } catch (e) {
        console.error('JSON parse error:', e);
        resolve({ error: 'JSON exception', debug: e.message, stdout: outputData });
      }
    });
  });
}

