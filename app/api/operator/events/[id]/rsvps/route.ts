import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') ?? '0', 10) || 0));
  const order = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

  // Joining application by email lets us surface archetype for live-feed UI.
  const rsvps = await db.rSVP.findMany({
    where: { workspaceId, eventId: id },
    select: {
      id: true,
      ticketStatus: true,
      origin: true,
      stripePaymentIntentId: true,
      paymentStatus: true,
      capturedAt: true,
      amountCents: true,
      refundedAt: true,
      refundAmountCents: true,
      checkedIn: true,
      checkedInAt: true,
      createdAt: true,
      isComp: true,
      compType: true,
      guestName: true,
      guestEmail: true,
      plusOneOfMemberId: true,
      plusOneName: true,
      plusOneInstagram: true,
      member: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: order },
    ...(limit > 0 ? { take: limit } : {}),
  });

  // Optional archetype enrichment (cheap email-keyed lookup).
  const emails = Array.from(
    new Set(rsvps.map((r) => r.member?.email ?? r.guestEmail).filter((e): e is string => !!e)),
  );
  const applications = emails.length
    ? await db.application.findMany({
        where: { workspaceId, email: { in: emails } },
        select: { email: true, archetype: true },
      })
    : [];
  const archetypeByEmail = new Map(applications.map((a) => [a.email.toLowerCase(), a.archetype]));

  const enriched = rsvps.map((r) => {
    const email = (r.member?.email ?? r.guestEmail ?? '').toLowerCase();
    return { ...r, archetype: archetypeByEmail.get(email) ?? null };
  });

  return NextResponse.json({ rsvps: enriched });
}
