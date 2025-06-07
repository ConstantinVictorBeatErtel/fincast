import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // Disable caching for this route

// GET handler for retrieving financial data
export async function GET(request) {
  try {
    console.log('API Route: Starting request');
    console.log('Current working directory:', process.cwd());
    
    // Look specifically in the public/data directory
    const dataDir = path.join(process.cwd(), 'public', 'data');
    console.log('Looking for data in:', dataDir);

    if (!fs.existsSync(dataDir)) {
      console.error('Data directory not found:', dataDir);
      return NextResponse.json(
        { 
          error: 'Data directory not found',
          dataDirectory: dataDir,
          environment: process.env.NODE_ENV,
          cwd: process.cwd()
        },
        { status: 404 }
      );
    }

    console.log(`Reading files from: ${dataDir}`);
    const files = fs.readdirSync(dataDir);
    console.log('Found files:', files);
    
    if (files.length === 0) {
      console.error('No data files found in directory');
      return NextResponse.json(
        { 
          error: 'No data files found',
          dataDirectory: dataDir,
          environment: process.env.NODE_ENV
        },
        { status: 404 }
      );
    }

    // Filter for metrics files and read their contents
    const metricsFiles = files.filter(file => file.endsWith('_metrics.json'));
    console.log('Metrics files found:', metricsFiles);

    const companies = metricsFiles.map(file => {
      try {
        const filePath = path.join(dataDir, file);
        console.log(`Reading file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        console.log(`Successfully parsed ${file}`);
        return data;
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
        return null;
      }
    }).filter(Boolean);

    if (companies.length === 0) {
      console.error('No valid company data found');
      return NextResponse.json(
        { 
          error: 'No valid company data found',
          dataDirectory: dataDir,
          environment: process.env.NODE_ENV,
          filesFound: files
        },
        { status: 404 }
      );
    }

    console.log(`Successfully processed ${companies.length} companies`);
    return NextResponse.json({
      message: 'Financial data retrieved successfully',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      dataDirectory: dataDir,
      companies: companies
    }, { status: 200 });
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch financial data',
        details: error.message,
        environment: process.env.NODE_ENV,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}

// POST handler for creating new forecasts
export async function POST(request) {
  try {
    const body = await request.json();

    // TODO: Implement actual forecast generation logic
    const response = {
      message: 'Forecast request received',
      input: body,
      timestamp: new Date().toISOString(),
      forecast: null // Placeholder for generated forecast
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate forecast' },
      { status: 500 }
    );
  }
}

// PUT handler for updating existing forecasts
export async function PUT(request) {
  try {
    const body = await request.json();

    // TODO: Implement forecast update logic
    const response = {
      message: 'Forecast update request received',
      input: body,
      timestamp: new Date().toISOString(),
      updated: false // Placeholder for update status
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update forecast' },
      { status: 500 }
    );
  }
}