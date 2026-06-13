import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';

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
      results.push({ id: rsvp.id, status: `error: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  return NextResponse.json({ captured: results.filter(r => r.status === 'captured').length, results });
}
