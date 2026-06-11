import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { alert } from '@/lib/alerting';

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
    select: { id: true, stripePaymentIntentId: true, paymentStatus: true, capturedAt: true },
  });

  if (!rsvp) return NextResponse.json({ error: 'RSVP not found' }, { status: 404 });
  if (!rsvp.stripePaymentIntentId) {
    return NextResponse.json({ error: 'No payment to capture' }, { status: 400 });
  }
  if (rsvp.capturedAt) {
    return NextResponse.json({ error: 'Already captured' }, { status: 409 });
  }

  const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);

  if (pi.status !== 'requires_capture') {
    return NextResponse.json(
      { error: `Cannot capture payment in status: ${pi.status}` },
      { status: 400 },
    );
  }

  try {
    await stripe.paymentIntents.capture(rsvp.stripePaymentIntentId);
  } catch (err) {
    void alert({
      severity: 'critical',
      event: 'stripe.payment_intent.capture_failed',
      workspaceId,
      context: {
        rsvpId: body.rsvpId,
        stripePaymentIntentId: rsvp.stripePaymentIntentId,
        errorClass: err instanceof Error ? err.constructor.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[capture] stripe.paymentIntents.capture failed', { workspaceId, rsvpId: body.rsvpId, err });
    return NextResponse.json({ error: 'Capture failed' }, { status: 502 });
  }

  await db.rSVP.update({
    where: { id: body.rsvpId },
    data: {
      paymentStatus: 'CAPTURED',
      capturedAt: new Date(),
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.payment_captured',
      entityType: 'RSVP',
      entityId: body.rsvpId,
    },
  });

  return NextResponse.json({ ok: true });
}
