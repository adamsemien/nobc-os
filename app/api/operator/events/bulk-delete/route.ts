import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  }

  const { ids } = parsed.data;

  const events = await db.event.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true, title: true },
  });

  if (events.length === 0) {
    return NextResponse.json({ error: 'No matching events found' }, { status: 404 });
  }

  const validIds = events.map(e => e.id);

  // Money guard: an event whose access rows still carry live Stripe money
  // (authorized hold, captured/partially-refunded charge, or a dispute) must
  // not be hard-deleted — the rows would vanish while the money dangles.
  // REFUNDED and FAILED are terminal; everything else with an intent blocks.
  const moneyRows = await db.rSVP.findMany({
    where: {
      eventId: { in: validIds },
      workspaceId,
      stripePaymentIntentId: { not: null },
      OR: [
        { paymentStatus: null },
        { paymentStatus: { notIn: ['REFUNDED', 'FAILED'] } },
      ],
    },
    select: { eventId: true },
  });
  if (moneyRows.length > 0) {
    const blockedIds = [...new Set(moneyRows.map(r => r.eventId))];
    const blockedTitles = events.filter(e => blockedIds.includes(e.id)).map(e => e.title);
    return NextResponse.json(
      {
        error:
          `${blockedTitles.join(', ')}: ${moneyRows.length} paid access ` +
          `record(s) still hold live payments. Refund or release them from the ` +
          `event's Attendees tab before deleting.`,
        blockedEventIds: blockedIds,
      },
      { status: 409 },
    );
  }

  // Deep-history guard: gate-engine commerce records (Ticket/Order) and sent
  // blasts also FK-restrict event deletion. Deleting those graphs correctly
  // is out of scope for a bulk endpoint — refuse honestly instead of letting
  // the transaction die on a foreign-key error.
  const [ticketCount, orderCount, blastCount] = await Promise.all([
    db.ticket.count({ where: { eventId: { in: validIds } } }),
    db.order.count({ where: { eventId: { in: validIds } } }),
    db.blast.count({ where: { eventId: { in: validIds } } }),
  ]);
  if (ticketCount + orderCount + blastCount > 0) {
    return NextResponse.json(
      {
        error:
          'These events carry ticketing or message history (gate tickets, orders, or sent blasts) ' +
          'that bulk delete does not remove. Cancel the event instead, or resolve those records first.',
      },
      { status: 409 },
    );
  }

  // AuditEvent has no FK to Event — the log is intentionally kept as the only
  // remaining record of what was deleted. Questions/workflows/waitlist rows
  // FK-restrict the event and go with it; optional relations (tiers, holds,
  // promo codes, SMS conversations) null out on their own.
  await db.$transaction([
    db.eventCustomQuestion.deleteMany({ where: { eventId: { in: validIds } } }),
    db.eventWorkflow.deleteMany({ where: { eventId: { in: validIds } } }),
    db.waitlistEntry.deleteMany({ where: { eventId: { in: validIds } } }),
    db.rSVP.deleteMany({ where: { eventId: { in: validIds }, workspaceId } }),
    db.event.deleteMany({ where: { id: { in: validIds }, workspaceId } }),
  ]);

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'event.bulk_deleted',
      entityType: 'EVENT',
      entityId: validIds[0],
      metadata: { deletedIds: validIds, titles: events.map(e => e.title) },
    },
  });

  return NextResponse.json({ ok: true, deleted: validIds.length });
}
