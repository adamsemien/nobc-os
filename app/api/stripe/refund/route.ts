import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { stripe } from '@/lib/stripe';
import { emitEvent } from '@/lib/emit-event';
import { refundActionForStatus } from '@/lib/ticketing/pricing';

const BodySchema = z.object({
  rsvpId: z.string(),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'rsvpId required' }, { status: 400 });
  }

  const rsvp = await db.rSVP.findFirst({
    where: { id: body.rsvpId, workspaceId },
    select: { id: true, stripePaymentIntentId: true, paymentStatus: true, refundedAt: true },
  });

  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  if (rsvp.refundedAt) return NextResponse.json({ error: 'Already refunded' }, { status: 409 });
  if (!rsvp.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No payment to refund' }, { status: 400 });
  }

  const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);
  const action = refundActionForStatus(pi.status);
  let refundAmountCents: number;

  if (action.kind === 'cancel') {
    await stripe.paymentIntents.cancel(rsvp.stripePaymentIntentId);
    refundAmountCents = pi.amount;
  } else if (action.kind === 'refund') {
    const refund = await stripe.refunds.create({ payment_intent: rsvp.stripePaymentIntentId });
    refundAmountCents = refund.amount;
  } else {
    return NextResponse.json({ error: action.reason }, { status: 400 });
  }

  await db.rSVP.update({
    where: { id: body.rsvpId },
    data: {
      paymentStatus: 'REFUNDED',
      ticketStatus: 'refunded',
      refundedAt: new Date(),
      refundAmountCents,
    },
  });

  // emitEvent writes AuditEvent + Svix — emit rsvp.refunded (audit) + rsvp.cancelled (webhook)
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.refunded',
    entityType: 'RSVP',
    entityId: body.rsvpId,
    metadata: { refundAmountCents },
  });

  emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.cancelled',
    entityType: 'RSVP',
    entityId: body.rsvpId,
    metadata: { refundAmountCents, reason: 'operator_refund' },
  }).catch(err => console.error('[refund] rsvp.cancelled emit failed:', err));

  return NextResponse.json({ ok: true, refundAmountCents });
}
