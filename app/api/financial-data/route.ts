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

    const companies = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      });

    console.log('Processed companies:', companies.length);

    return NextResponse.json({
      companies,
      forecasts: [],
      marketData: null
    });
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 