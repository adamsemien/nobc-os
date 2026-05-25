import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { stripe } from '@/lib/stripe';
import { emitEvent } from '@/lib/emit-event';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const rsvp = await db.rSVP.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      ticketStatus: true,
      stripePaymentIntentId: true,
      paymentStatus: true,
    },
  });
  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });

  const terminal = ['cancelled', 'rejected', 'refunded'];
  if (terminal.includes(rsvp.ticketStatus)) {
    return NextResponse.json({ error: 'RSVP is already in a terminal state' }, { status: 409 });
  }
  if (rsvp.paymentStatus === 'CAPTURED') {
    return NextResponse.json(
      { error: 'Payment already captured — use the refund action instead' },
      { status: 409 },
    );
  }

  const updateData: Record<string, unknown> = {
    ticketStatus: 'cancelled',
    status: 'DECLINED',
  };

  if (rsvp.stripePaymentIntentId && rsvp.paymentStatus === 'AUTHORIZED') {
    const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);
    if (pi.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(rsvp.stripePaymentIntentId);
    }
    updateData.paymentStatus = 'REFUNDED';
    updateData.refundedAt = new Date();
    updateData.refundAmountCents = pi.amount;
  }

  await db.rSVP.update({ where: { id }, data: updateData });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.cancelled',
    entityType: 'RSVP',
    entityId: id,
    metadata: { reason: 'operator_cancel' },
  });

  return NextResponse.json({ ok: true });
}
