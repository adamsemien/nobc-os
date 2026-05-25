import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { stripe } from '@/lib/stripe';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const rsvp = await db.rSVP.findFirst({
    where: { id, workspaceId },
    select: { id: true, ticketStatus: true, stripePaymentIntentId: true, refundedAt: true },
  });

  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  if (rsvp.refundedAt) return NextResponse.json({ error: 'Already refunded' }, { status: 409 });
  if (!rsvp.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No payment to refund' }, { status: 400 });
  }

  let refundAmountCents: number;
  const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);

  if (pi.status === 'requires_capture') {
    // Not yet captured — cancel the authorization instead
    await stripe.paymentIntents.cancel(rsvp.stripePaymentIntentId);
    refundAmountCents = pi.amount;
  } else if (pi.status === 'succeeded') {
    const refund = await stripe.refunds.create({ payment_intent: rsvp.stripePaymentIntentId });
    refundAmountCents = refund.amount;
  } else {
    return NextResponse.json({ error: `Cannot refund payment in status: ${pi.status}` }, { status: 400 });
  }

  await db.rSVP.update({
    where: { id },
    data: {
      paymentStatus: 'REFUNDED',
      ticketStatus: 'refunded',
      refundedAt: new Date(),
      refundAmountCents,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.refunded',
      entityType: 'RSVP',
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true, refundAmountCents });
}
