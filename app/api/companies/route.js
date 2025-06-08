import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    
    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('Data directory not found, returning empty array');
      return NextResponse.json([]);
    }
    
    const files = fs.readdirSync(dataDir);
    
    // Filter for company metrics files
    const companyFiles = files.filter(file => file.endsWith('_metrics.json'));
    
    // Read and combine all company data
    const companies = companyFiles.map(file => {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data;
    });

    return NextResponse.json(companies);
  } catch (error) {
    console.error('Error reading company data:', error);
    // Return empty array instead of error
    return NextResponse.json([]);
  }
} 