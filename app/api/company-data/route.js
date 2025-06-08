import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return new Response(JSON.stringify({ error: 'Ticker symbol is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Execute the Python script with the ticker as an argument
    const { stdout, stderr } = await execAsync(`python3 scripts/fetch_company_data.py ${ticker}`);
    
    if (stderr) {
      console.error('Python script error:', stderr);
      return new Response(JSON.stringify({ error: 'Error fetching company data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse the Python script output
    const data = JSON.parse(stdout);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 