import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // Disable caching for this route

// GET handler for retrieving financial data
export async function GET(request) {
  try {
    // In development, use the local data directory
    // In production (Vercel), use the public directory
    const isDevelopment = process.env.NODE_ENV === 'development';
    const dataDir = isDevelopment 
      ? path.join(process.cwd(), 'fincast', 'data')
      : path.join(process.cwd(), 'public', 'data');

    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
      console.error(`Data directory not found: ${dataDir}`);
      return NextResponse.json(
        { error: 'Data directory not found' },
        { status: 404 }
      );
    }

    const files = fs.readdirSync(dataDir);
    
    if (files.length === 0) {
      console.error('No data files found in directory');
      return NextResponse.json(
        { error: 'No data files found' },
        { status: 404 }
      );
    }

    // Filter for metrics files and read their contents
    const metricsFiles = files.filter(file => file.endsWith('_metrics.json'));
    const companies = metricsFiles.map(file => {
      try {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
        return null;
      }
    }).filter(Boolean); // Remove any null entries from failed reads

    if (companies.length === 0) {
      return NextResponse.json(
        { error: 'No valid company data found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Financial data retrieved successfully',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      dataDirectory: dataDir,
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