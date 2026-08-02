import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        userId: session.user.id,
      },
      include: {
        holdings: {
          include: {
            valuations: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!portfolio) {
      return NextResponse.json({ holdings: [] });
    }

    const holdings = portfolio.holdings.map((holding) => ({
      id: holding.id,
      ticker: holding.ticker,
      shares: holding.shares,
      avgPrice: holding.avgPrice,
      latestValuation: holding.valuations[0] || null,
    }));

    return NextResponse.json({ holdings });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { ticker, shares, avgPrice } = await request.json();

    if (!ticker || !shares || !avgPrice) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let portfolio = await prisma.portfolio.findFirst({
      where: {
        userId: session.user.id,
      },
    });

    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          name: 'My Portfolio',
          userId: session.user.id,
        },
      });
    }

    const existingHolding = await prisma.holding.findFirst({
      where: {
        portfolioId: portfolio.id,
        ticker: ticker.toUpperCase(),
      },
    });

    if (existingHolding) {
      return NextResponse.json(
        { error: 'Holding already exists for this ticker' },
        { status: 400 }
      );
    }

    const holding = await prisma.holding.create({
      data: {
        ticker: ticker.toUpperCase(),
        shares: parseFloat(shares),
        avgPrice: parseFloat(avgPrice),
        portfolioId: portfolio.id,
      },
    });

    return NextResponse.json(
      { message: 'Holding added successfully', holding },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding holding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
