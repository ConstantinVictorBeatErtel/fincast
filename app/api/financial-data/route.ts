import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic'; // Disable caching for this route

export async function GET() {
  try {
    // In development, use the local data directory
    // In production (Vercel), use the public directory
    const isDevelopment = process.env.NODE_ENV === 'development';
    const dataDir = isDevelopment 
      ? path.join(process.cwd(), 'data')
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

    const companies = files
      .filter(file => file.endsWith('_metrics.json'))
      .map(file => {
        try {
          const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          console.error(`Error reading file ${file}:`, error);
          return null;
        }
      })
      .filter(Boolean); // Remove any null entries from failed reads

    if (companies.length === 0) {
      return NextResponse.json(
        { error: 'No valid company data found' },
        { status: 404 }
      );
    }

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