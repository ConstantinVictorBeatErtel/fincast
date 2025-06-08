import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('API route called');
    // Changed from 'public/data' to just 'data'
    const dataDir = path.join(process.cwd(), 'data');
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

    const metricsFiles = files.filter(file => file.endsWith('_metrics.json'));
    const companies = metricsFiles.map(file => {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    });

    const spyMetricsFile = files.find(file => file === 'SPY_metrics.json');
    const marketData = spyMetricsFile ? JSON.parse(fs.readFileSync(path.join(dataDir, spyMetricsFile), 'utf-8')) : null;

    console.log('Processed companies:', companies.length);

    return NextResponse.json({
      companies,
      forecasts: [],
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