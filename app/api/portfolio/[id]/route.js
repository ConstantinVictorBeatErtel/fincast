import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Verify the holding belongs to the user
    const holding = await prisma.holding.findFirst({
      where: {
        id: id,
        portfolio: {
          userId: session.user.id
        }
      }
    });

    if (!holding) {
      return NextResponse.json(
        { error: 'Holding not found' },
        { status: 404 }
      );
    }

    // Delete the holding
    await prisma.holding.delete({
      where: {
        id: id
      }
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