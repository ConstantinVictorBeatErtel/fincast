import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Signup is disabled in this deployment.' },
    { status: 501 }
  );
}