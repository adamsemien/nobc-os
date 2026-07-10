import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Slice 5 — "mark invited to event" (Person detail page, single person at a
 *  time; bulk/event-first invite is deferred). CRM-side annotation ONLY: the
 *  MemberEngagementEvent row itself is the invite record (Option 1, no new
 *  model — see the Slice 5 recon). Dual-pointer, personId always set so a
 *  bare lead can be invited without being promoted to Member; memberId is
 *  attached too when the Person already has one, same as every prior slice's
 *  dual-pointer writes. Never creates a Member, never writes RSVP. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const eventId = (body as Record<string, unknown> | null)?.eventId;
  if (typeof eventId !== 'string' || !eventId) {
    return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
  }

  const person = await db.person.findFirst({
    where: { id, workspaceId },
    include: { members: { where: { mergedIntoId: null }, select: { id: true }, take: 1 } },
  });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — mark the surviving record invited instead.' },
      { status: 409 },
    );
  }

  const event = await db.event.findFirst({ where: { id: eventId, workspaceId }, select: { id: true, title: true } });
  if (!event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });

  const memberId = person.members[0]?.id ?? null;

  // Awaited and NOT swallowed — this write IS the invite record (Option 1),
  // not a supplementary signal, so a failure here must surface to the
  // operator rather than disappear the way lib/engagement.ts's fire-and-forget
  // logEngagementEvent() would.
  const engagementEvent = await db.memberEngagementEvent.create({
    data: {
      workspaceId,
      personId: person.id,
      memberId,
      eventType: 'invited',
      eventId: event.id,
    },
    select: { id: true, occurredAt: true },
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.marked_invited',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { eventId: event.id, eventTitle: event.title },
  });

  return NextResponse.json({ id: engagementEvent.id, occurredAt: engagementEvent.occurredAt });
}
