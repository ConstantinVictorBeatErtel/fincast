import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'market_data.json');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Market data not available' },
        { status: 404 }
      );
    }

    const marketData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return NextResponse.json(marketData);
  } catch (error) {
    console.error('Error reading market data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 500 }
    );
  }
} 