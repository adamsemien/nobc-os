import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { alert } from '@/lib/alerting';

// Called nightly by Vercel cron. Captures authorized holds for events starting within 24h.
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/capture-payments", "schedule": "0 12 * * *" }] }
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now

  const rsvps = await db.rSVP.findMany({
    where: {
      ticketStatus: 'confirmed',
      // Only authorized holds awaiting capture — without this the cron loads every
      // confirmed PI'd RSVP and burns a Stripe retrieve per row just to skip the
      // already-captured ones. Apply-required holds are confirmed + AUTHORIZED.
      paymentStatus: 'AUTHORIZED',
      stripePaymentIntentId: { not: null },
      refundedAt: null,
      event: { startAt: { lte: cutoff } },
    },
    select: { id: true, stripePaymentIntentId: true, workspaceId: true },
  });

  const results: { id: string; status: string }[] = [];

  for (const rsvp of rsvps) {
    if (!rsvp.stripePaymentIntentId) continue;
    try {
      const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);
      if (pi.status !== 'requires_capture') {
        results.push({ id: rsvp.id, status: 'skipped' });
        continue;
      }
      await stripe.paymentIntents.capture(rsvp.stripePaymentIntentId);
      // Reflect the capture in money state immediately (the webhook also sets this
      // via payment_intent.succeeded, but the backstop must not leave the operator
      // UI showing an uncaptured hold if that event is delayed/missed). Scoped to
      // the workspace and guarded so it never regresses a refunded/disputed row.
      await db.rSVP.updateMany({
        where: {
          id: rsvp.id,
          workspaceId: rsvp.workspaceId,
          paymentStatus: { notIn: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'] },
        },
        data: { paymentStatus: 'CAPTURED', capturedAt: new Date() },
      });
      await db.auditEvent.create({
        data: {
          workspaceId: rsvp.workspaceId,
          actorId: 'cron',
          action: 'rsvp.payment_captured',
          entityType: 'RSVP',
          entityId: rsvp.id,
        },
      });
      results.push({ id: rsvp.id, status: 'captured' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      // A swallowed capture failure means money was authorized but never
      // captured, with no signal to the operator. Log + alert per failure;
      // the batch structure (results array) is unchanged.
      console.error('[capture-payments] capture failed', { rsvpId: rsvp.id, err: message });
      await alert({
        severity: 'error',
        event: 'stripe.capture.failed',
        workspaceId: rsvp.workspaceId,
        context: { rsvpId: rsvp.id, paymentIntentId: rsvp.stripePaymentIntentId, error: message },
      });
      results.push({ id: rsvp.id, status: `error: ${message}` });
    }
  }

  return NextResponse.json({ captured: results.filter(r => r.status === 'captured').length, results });
}
