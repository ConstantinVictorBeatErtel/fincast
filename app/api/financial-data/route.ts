import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // Disable caching for this route

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    console.log('Current working directory:', process.cwd());
    console.log('Looking for data in:', dataDir);

    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
      console.error(`Data directory not found: ${dataDir}`);
      return NextResponse.json(
        { error: 'Data directory not found', path: dataDir },
        { status: 404 }
      );
    }

    const files = fs.readdirSync(dataDir);
    console.log('Files found in data directory:', files);
    
    if (files.length === 0) {
      console.error('No data files found in directory');
      return NextResponse.json(
        { error: 'No data files found', path: dataDir },
        { status: 404 }
      );
    }

    const companies = files
      .filter(file => file.endsWith('_metrics.json'))
      .map(file => {
        try {
          const filePath = path.join(dataDir, file);
          console.log('Reading file:', filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          console.error(`Error reading file ${file}:`, error);
          return null;
        }
      })
      .filter(Boolean); // Remove any null entries from failed reads

    if (companies.length === 0) {
      return NextResponse.json(
        { error: 'No valid company data found', path: dataDir },
        { status: 404 }
      );
    }

    console.log('Successfully processed companies:', companies.map(c => c.Symbol));
    return NextResponse.json({ 
      companies,
      environment: process.env.NODE_ENV,
      dataDirectory: dataDir
    });
  } catch (error) {
    console.error('Error reading financial data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial data' },
      { status: 500 }
    );
  }
} 