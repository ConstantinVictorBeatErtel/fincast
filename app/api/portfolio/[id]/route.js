import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;

    const holding = await prisma.holding.findFirst({
      where: {
        id,
        portfolio: {
          userId: session.user.id,
        },
      },
    });

    if (!holding) {
      return NextResponse.json(
        { error: 'Holding not found' },
        { status: 404 }
      );
    }

    await prisma.holding.delete({
      where: { id },
    });

    return NextResponse.json(
      { message: 'Holding removed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error removing holding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
