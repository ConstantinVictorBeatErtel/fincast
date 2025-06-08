import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker symbol is required' },
        { status: 400 }
      );
    }

    // Get the absolute path to the Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_company_data.py');
    
    // Execute the Python script
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${ticker}"`);
    
    if (stderr) {
      console.error('Python script error:', stderr);
    }

    try {
      const data = JSON.parse(stdout);
      
      if (data.error) {
        return NextResponse.json(
          { error: data.error },
          { status: 400 }
        );
      }

      return NextResponse.json(data);
    } catch (parseError) {
      console.error('Error parsing Python output:', parseError);
      console.error('Raw output:', stdout);
      return NextResponse.json(
        { error: 'Invalid response from data service' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 