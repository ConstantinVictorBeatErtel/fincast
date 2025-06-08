import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'market_data.json');
    
    if (!fs.existsSync(filePath)) {
      console.log('Market data file not found, returning empty object');
      return NextResponse.json({});
    }

    const marketData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return NextResponse.json(marketData);
  } catch (error) {
    console.error('Error reading market data:', error);
    // Return empty object instead of error
    return NextResponse.json({});
  }
} 