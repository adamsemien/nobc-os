import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const rsvps = await db.rSVP.findMany({
    where: { workspaceId, eventId: id },
    select: {
      id: true,
      ticketStatus: true,
      origin: true,
      stripePaymentIntentId: true,
      refundedAt: true,
      refundAmountCents: true,
      checkedIn: true,
      createdAt: true,
      member: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ rsvps });
}
