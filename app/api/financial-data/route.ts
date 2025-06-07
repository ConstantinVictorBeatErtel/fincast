import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic'; // Disable caching for this route

export async function GET() {
  try {
    console.log('API route called');
    const dataDir = path.join(process.cwd(), 'public', 'data');
    console.log('Data directory:', dataDir);

    if (!fs.existsSync(dataDir)) {
      console.error('Data directory not found:', dataDir);
      return NextResponse.json(
        { error: 'Data directory not found' },
        { status: 500 }
      );
    }

    const files = fs.readdirSync(dataDir);
    console.log('Files found:', files);

    if (files.length === 0) {
      console.error('No data files found in directory:', dataDir);
      return NextResponse.json(
        { error: 'No data files found' },
        { status: 404 }
      );
    }

    // Get all metrics files
    const metricsFiles = files.filter(file => file.endsWith('_metrics.json'));
    const companies = metricsFiles.map(file => {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    });

    // Get market data from SPY metrics
    const spyMetricsFile = files.find(file => file === 'SPY_metrics.json');
    const marketData = spyMetricsFile ? JSON.parse(fs.readFileSync(path.join(dataDir, spyMetricsFile), 'utf-8')) : null;

    console.log('Processed companies:', companies.length);

    return NextResponse.json({
      companies,
      forecasts: [], // We can add forecasts later if needed
      marketData
    });
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 