import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

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
    console.log(`Fetching data for ticker: ${ticker}`);
    
    // Get the absolute path to the Python script
    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_company_data.py');
    console.log('Script path:', scriptPath);
    
    // Execute the Python script with the ticker as an argument
    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${ticker}"`);
    
    // Log stderr for debugging but don't treat it as an error
    if (stderr) {
      console.log('Python script debug output:', stderr);
    }

    console.log('Python script output:', stdout);

    try {
      // Parse the Python script output
      const data = JSON.parse(stdout);
      
      if (data.error) {
        console.error('Data fetch error:', data.error);
        return new Response(JSON.stringify({ error: data.error }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw stdout:', stdout);
      return new Response(JSON.stringify({ error: 'Error parsing Python script output' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: `Internal server error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 