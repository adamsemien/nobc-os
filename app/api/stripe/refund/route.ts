import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { stripe } from '@/lib/stripe';
import { emitEvent } from '@/lib/emit-event';
import { refundActionForStatus } from '@/lib/ticketing/pricing';
import { alert } from '@/lib/alerting';

const BodySchema = z.object({
  rsvpId: z.string(),
  // Optional partial-refund amount in cents. Omit for a full refund (the whole
  // remaining captured balance). Must be a positive integer no greater than the
  // remaining refundable amount.
  amountCents: z.number().int().positive().optional(),
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
    select: {
      id: true,
      stripePaymentIntentId: true,
      paymentStatus: true,
      refundedAt: true,
      amountCents: true,
      refundAmountCents: true,
    },
  });

  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  // L2: a *fully* refunded ticket is gated by paymentStatus, not just refundedAt.
  // A PARTIALLY_REFUNDED ticket has no refundedAt (the webhook reserves it for
  // full refunds) and is still refundable up to the remaining balance, so it is
  // intentionally NOT blocked here.
  if (rsvp.paymentStatus === 'REFUNDED' || rsvp.refundedAt) {
    return NextResponse.json({ error: 'Already refunded' }, { status: 409 });
  }
  if (!rsvp.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No payment to refund' }, { status: 400 });
  }

  const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);
  const action = refundActionForStatus(pi.status);

  // An uncaptured authorization can only be released in full (Stripe cannot
  // partially cancel a hold). A partial amount only makes sense post-capture.
  if (action.kind === 'cancel' && body.amountCents != null) {
    return NextResponse.json(
      { error: 'Cannot partially cancel an uncaptured authorization. Capture first, then refund a partial amount.' },
      { status: 400 },
    );
  }

  // Cumulative refunded total is the source of truth for full-vs-partial, mirroring
  // the webhook's charge.refunded handler (which keys off charge.amount_refunded).
  const alreadyRefunded = rsvp.refundAmountCents ?? 0;
  const chargedCents = rsvp.amountCents ?? pi.amount;
  // Guard the over-refund math: if we cannot establish a positive charge amount,
  // remainingRefundable would be NaN/negative and the cap below would be bypassed.
  if (!chargedCents || chargedCents <= 0) {
    return NextResponse.json({ error: 'Cannot determine the charge amount to refund' }, { status: 500 });
  }
  const remainingRefundable = chargedCents - alreadyRefunded;

  if (action.kind === 'refund' && body.amountCents != null && body.amountCents > remainingRefundable) {
    return NextResponse.json(
      { error: `Refund exceeds remaining refundable balance (${remainingRefundable} cents).` },
      { status: 400 },
    );
  }

  let thisRefundCents: number;
  try {
    if (action.kind === 'cancel') {
      // Releasing the full authorization hold. Idempotency-keyed so a retry after
      // a failed DB write does not attempt a second cancel.
      await stripe.paymentIntents.cancel(
        rsvp.stripePaymentIntentId,
        {},
        { idempotencyKey: `cancel-${rsvp.id}` },
      );
      // A released hold never captured money, so $0 was actually refunded. Recording
      // pi.amount here would inflate refund reporting on a payment that never moved.
      thisRefundCents = 0;
    } else if (action.kind === 'refund') {
      // Idempotency key encodes the cumulative target so a retry of the *same*
      // refund dedups at Stripe, while a genuinely new partial gets a fresh key.
      const cumulativeTarget = alreadyRefunded + (body.amountCents ?? remainingRefundable);
      const refund = await stripe.refunds.create(
        {
          payment_intent: rsvp.stripePaymentIntentId,
          ...(body.amountCents != null ? { amount: body.amountCents } : {}),
        },
        { idempotencyKey: `refund-${rsvp.id}-${cumulativeTarget}` },
      );
      thisRefundCents = refund.amount;
    } else {
      return NextResponse.json({ error: action.reason }, { status: 400 });
    }
  } catch (err) {
    void alert({
      severity: 'critical',
      event: 'stripe.refund.failed',
      workspaceId,
      context: {
        rsvpId: body.rsvpId,
        stripePaymentIntentId: rsvp.stripePaymentIntentId,
        actionKind: action.kind,
        errorClass: err instanceof Error ? err.constructor.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[refund] stripe refund/cancel failed', { workspaceId, rsvpId: body.rsvpId, err });
    return NextResponse.json({ error: 'Refund failed' }, { status: 502 });
  }

  const cumulativeRefundCents = alreadyRefunded + thisRefundCents;
  // A hold cancel releases the entire authorization (Stripe has no partial cancel),
  // so it is always fully resolved even though $0 was actually refunded.
  const fully = action.kind === 'cancel' || cumulativeRefundCents >= chargedCents;

  // M3: Stripe and Postgres are two systems and cannot be written atomically.
  // The webhook charge.refunded handler is the reconciliation authority — it is
  // idempotent, workspace-scoped, and do-not-regress guarded, so if this DB
  // write fails the refund state still converges when Stripe delivers the event.
  // This write is the fast path so the operator UI reflects the refund at once.
  // updateMany (not update) so the write is workspace-scoped defense-in-depth.
  await db.rSVP.updateMany({
    where: { id: body.rsvpId, workspaceId },
    data: fully
      ? {
          paymentStatus: 'REFUNDED',
          ticketStatus: 'refunded',
          refundedAt: new Date(),
          refundAmountCents: cumulativeRefundCents,
        }
      : {
          // Partial: keep ticketStatus (they still hold a seat) and leave
          // refundedAt null, exactly as the webhook's partial branch does.
          paymentStatus: 'PARTIALLY_REFUNDED',
          refundAmountCents: cumulativeRefundCents,
        },
  });

  // emitEvent writes AuditEvent + Svix. Audit every refund; emit the rsvp.cancelled
  // webhook only on a full refund, matching the charge.refunded handler.
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.refunded',
    entityType: 'RSVP',
    entityId: body.rsvpId,
    metadata: { refundAmountCents: thisRefundCents, cumulativeRefundCents, fully },
  });

  if (fully) {
    emitEvent({
      workspaceId,
      actorId: userId,
      action: 'rsvp.cancelled',
      entityType: 'RSVP',
      entityId: body.rsvpId,
      metadata: { refundAmountCents: cumulativeRefundCents, reason: 'operator_refund' },
    }).catch(err => console.error('[refund] rsvp.cancelled emit failed:', err));
  }

  return NextResponse.json({
    ok: true,
    refundAmountCents: thisRefundCents,
    cumulativeRefundCents,
    fully,
  });
}
