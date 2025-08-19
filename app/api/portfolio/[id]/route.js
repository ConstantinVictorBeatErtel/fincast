import { NextResponse } from 'next/server';

export async function DELETE() {
  return NextResponse.json(
    { error: 'Portfolio writes are disabled in this deployment.' },
    { status: 501 }
  );
}