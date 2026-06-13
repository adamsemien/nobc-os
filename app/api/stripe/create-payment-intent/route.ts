import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { getOrCreateMemberFromClerk } from '@/lib/clerk-member';
import { stripe } from '@/lib/stripe';
import { alert } from '@/lib/alerting';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { eventId: string; customAnswers?: Record<string, string | boolean | number | null> };
  try {
    body = (await req.json()) as { eventId: string; customAnswers?: Record<string, string | boolean | number | null> };
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { eventId, customAnswers } = body;
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
      capacity: true,
      accessMode: true,
      approvalRequired: true,
    },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  let member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true, approved: true, email: true, firstName: true, lastName: true },
  });
  // Approval-required ticketed events allow non-members to purchase at non-member price.
  if (!member && event.approvalRequired) {
    member = await getOrCreateMemberFromClerk(workspaceId, userId);
  }

  if (!member) return NextResponse.json({ error: 'Members only' }, { status: 403 });

  // Standard ticketed (no approval gate): must be an approved member.
  if (!event.approvalRequired && !member.approved) {
    return NextResponse.json({ error: 'Members only' }, { status: 403 });
  }

  let amountCents = event.priceInCents ?? 0;
  // Approval-required: unapproved purchasers pay non-member price.
  if (event.approvalRequired && !member.approved) {
    amountCents = event.nonMemberPriceInCents ?? event.priceInCents ?? 0;
  }

  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: 'Event has no price' }, { status: 400 });
  }

  if (event.capacity) {
    const taken = await db.rSVP.count({
      where: { workspaceId, eventId, ticketStatus: { in: ['confirmed', 'held'] } },
    });
    if (taken >= event.capacity) {
      return NextResponse.json({ error: 'Event is full' }, { status: 409 });
    }
  }

  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId, memberId: member.id },
    select: { id: true, ticketStatus: true, stripePaymentIntentId: true },
  });

  if (existing) {
    if (existing.ticketStatus === 'confirmed') {
      return NextResponse.json({ error: 'Already reserved' }, { status: 409 });
    }
    if (existing.ticketStatus === 'held' && existing.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
        return NextResponse.json({
          clientSecret: pi.client_secret,
          rsvpId: existing.id,
          amountCents: pi.amount ?? amountCents,
        });
      }
      // Payment already went through on a prior attempt — the payment_intent.succeeded
      // webhook will flip this RSVP to confirmed. Never cancel a succeeded PI (that
      // throws) and never re-create (that double-charges). Return 409.
      if (pi.status === 'succeeded') {
        return NextResponse.json({ error: 'Already reserved' }, { status: 409 });
      }
      // Any other non-terminal state: release the stale hold before re-creating.
      // Best-effort + catch: the PI could race to succeeded between retrieve and
      // cancel, which would otherwise throw and 500 a member whose card is fine.
      if (pi.status !== 'canceled') {
        await stripe.paymentIntents
          .cancel(existing.stripePaymentIntentId)
          .catch((e) =>
            console.error('[create-payment-intent] failed to cancel stale PI', {
              piId: existing.stripePaymentIntentId,
              e,
            }),
          );
      }
    }
  }

  // Idempotency key scoped to (workspace, event, member, amount, capture_method)
  // so a double-click or network retry resolves to the same PaymentIntent, while
  // a genuine change between attempts (tier/price change -> different amount,
  // approvalRequired toggle -> different capture_method) produces a FRESH key.
  // Without amount+mode in the key, Stripe returns the original PI and ignores
  // the new params, charging the stale amount or minting the wrong hold type.
  const captureMethod = event.approvalRequired ? 'manual' : 'automatic';
  const idempotencyKey = `pi-${workspaceId}-${eventId}-${member.id}-${amountCents}-${captureMethod}`;
  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.create>>;
  try {
    pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        // approvalRequired -> 'manual' (authorize-and-hold, captured on operator
        // approval); ticketed no-approval -> 'automatic' (immediate capture,
        // captured by Stripe on payment_intent.succeeded).
        capture_method: captureMethod,
        description: event.title,
        receipt_email: member.email,
        metadata: { workspaceId, eventId, memberId: member.id },
      },
      { idempotencyKey },
    );
  } catch (err) {
    void alert({
      severity: 'critical',
      event: 'stripe.payment_intent.create_failed',
      workspaceId,
      context: {
        eventId,
        amountCents,
        errorClass: err instanceof Error ? err.constructor.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[create-payment-intent] stripe.paymentIntents.create failed', { workspaceId, eventId, err });
    return NextResponse.json({ error: 'Payment setup failed' }, { status: 502 });
  }

  if (existing) {
    await db.rSVP.update({
      where: { id: existing.id },
      data: {
        stripePaymentIntentId: pi.id,
        paymentStatus: 'PENDING',
        ticketStatus: 'held',
        customAnswers: customAnswers ?? undefined,
      },
    });
    return NextResponse.json({ clientSecret: pi.client_secret, rsvpId: existing.id, amountCents });
  }

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: member.id,
      status: 'CONFIRMED',
      ticketStatus: 'held',
      stripePaymentIntentId: pi.id,
      paymentStatus: 'PENDING',
      customAnswers: customAnswers ?? undefined,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.payment_initiated',
      entityType: 'RSVP',
      entityId: rsvp.id,
    },
  });

  return NextResponse.json({ clientSecret: pi.client_secret, rsvpId: rsvp.id, amountCents });
}
