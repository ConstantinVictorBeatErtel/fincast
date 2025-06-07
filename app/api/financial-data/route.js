import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// GET handler for retrieving financial data
export async function GET(request) {
  try {
    const dataDir = path.join(process.cwd(), 'fincast/data');
    const files = fs.readdirSync(dataDir);
    
    // Filter for metrics files and read their contents
    const metricsFiles = files.filter(file => file.endsWith('_metrics.json'));
    const companies = metricsFiles.map(file => {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      return JSON.parse(content);
    });

    return NextResponse.json({
      message: 'Financial data retrieved successfully',
      timestamp: new Date().toISOString(),
      companies: companies
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching financial data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data' },
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