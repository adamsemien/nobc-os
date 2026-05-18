import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { emitEvent } from '@/lib/emit-event';

const BodySchema = z.object({
  rsvpId: z.string(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

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
  let refundAmountCents: number;

  if (pi.status === 'requires_capture') {
    await stripe.paymentIntents.cancel(rsvp.stripePaymentIntentId);
    refundAmountCents = pi.amount;
  } else if (pi.status === 'succeeded') {
    const refund = await stripe.refunds.create({ payment_intent: rsvp.stripePaymentIntentId });
    refundAmountCents = refund.amount;
  } else {
    return NextResponse.json({ error: `Cannot refund payment in status: ${pi.status}` }, { status: 400 });
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
