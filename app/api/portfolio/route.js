import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ holdings: [] });
}

export async function POST() {
  return NextResponse.json(
    { error: 'Portfolio writes are disabled in this deployment.' },
    { status: 501 }
  );
}