import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  const events = await db.event.findMany({
    where: { workspaceId },
    select: {
      id: true,
      slug: true,
      title: true,
      startAt: true,
      location: true,
      status: true,
      accessMode: true,
      capacity: true,
      priceInCents: true,
      rsvps: {
        where: { ticketStatus: { in: ['confirmed', 'held'] } },
        select: { ticketStatus: true, stripePaymentIntentId: true, refundAmountCents: true },
      },
    },
    orderBy: { startAt: 'desc' },
  });

  const result = events.map(({ rsvps, ...ev }) => {
    const capacityUsed = rsvps.length;
    const revenueCents = rsvps
      .filter(r => r.ticketStatus === 'confirmed' && r.stripePaymentIntentId != null)
      .reduce((sum, r) => sum + (ev.priceInCents ?? 0) - (r.refundAmountCents ?? 0), 0);
    return { ...ev, capacityUsed, revenueCents };
  });

  return NextResponse.json({ events: result });
}

/** @deprecated POST is inert (410) as of the ai-event-creation build
 *  (2026-07-12). This handler wrote the PRE-rebuild access shape - the
 *  Event.eventAccess JSON blob plus EventWorkflow.paths - and never minted a
 *  Gate-engine tree, so anything it created disagreed with every live
 *  authoring surface. It had zero callers (UI or tests) when retired; the
 *  live create path is lib/builder/actions.ts createEventDraft, reached
 *  through the builder + the compose flow. The old implementation is in git
 *  history if archaeology is ever needed. GET above remains live (the
 *  operator events list). */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Deprecated - event creation moved to the event builder. Use /operator/events/new.',
    },
    { status: 410 },
  );
}
