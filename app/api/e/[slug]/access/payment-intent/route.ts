/**
 * Public event PaymentIntent creation — /api/e/[slug]/access/payment-intent
 *
 * Mirrors /api/m/events/[slug]/access/payment-intent/route.ts with these differences:
 *   - Rate-limited first (F5): publicRateLimit before any DB call; 429 on limit
 *   - No operator bypass (isOperator check removed entirely)
 *   - Workspace resolved via resolvePublishedEventBySlug (F4: two-step)
 *   - auth() called but userId may be null — no redirect
 *   - Guest path always available for TICKETED events; member path requires userId + Member
 *
 * Authorize-then-hold semantics are unchanged from the existing member route:
 *   - TICKETED + approvalRequired → PaymentIntent authorized (capture_method: 'manual')
 *     with ticketStatus: 'held'. Captured on operator approval; cancelled on rejection.
 *   - TICKETED (no approval) → same authorize; capture triggered by Stripe webhook
 *     on payment_intent.succeeded.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { resolveViewer } from '@/lib/event-access';
import {
  loadAccessContext,
  priceForResolved,
  findOrCreateGuestMember,
  hasCapacity,
} from '@/lib/event-access-submit';
import { resolvePublishedEventBySlug } from '@/lib/public-event-loader';
import { publicRateLimit } from '@/lib/public-rate-limit';

const BodySchema = z.object({
  guestEmail: z.string().email().optional(),
  guestName: z.string().min(1).optional(),
  customAnswers: z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()])).optional(),
  tierId: z.string().cuid().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // F5: Rate limit before any DB call — protects against card testing / RSVP spam.
  const rateCheck = publicRateLimit(req);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSecs) },
      },
    );
  }

  const { slug } = await params;
  const { userId } = await auth();

  // F4: Two-step workspace resolve — never accept workspaceId from client input.
  // Step 1: slug → workspaceId (server-derived only).
  const eventRef = await resolvePublishedEventBySlug(slug);
  if (!eventRef) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  const { workspaceId, eventId } = eventRef;

  // Step 2: fetch event scoped to the resolved workspaceId.
  const evt = await db.event.findFirst({
    where: { workspaceId, id: eventId },
    select: { id: true },
  });
  if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Look up member record scoped to the resolved workspaceId.
  const member = userId
    ? await db.member.findFirst({
        where: { workspaceId, clerkUserId: userId },
        select: { id: true, status: true, email: true, memberQrCode: true },
      })
    : null;

  // Viewer resolution — no operator bypass on the public surface.
  const viewer = resolveViewer(member, userId);
  const ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { resolved, event } = ctx;

  // Tier-based pricing: if a tierId is provided, use the tier price.
  let amountCents: number;
  const resolvedTierId: string | undefined = body.tierId;
  if (body.tierId) {
    const tier = await db.ticketTier.findFirst({
      where: { id: body.tierId, workspaceId, eventId: evt.id, manuallyClosed: false },
      select: { memberPriceCents: true, nonMemberPriceCents: true },
    });
    if (!tier) return NextResponse.json({ error: 'Ticket tier not found' }, { status: 404 });
    const price = resolved.kind === 'guest' ? tier.nonMemberPriceCents : tier.memberPriceCents;
    if (price == null) return NextResponse.json({ error: 'Tier not available for this access level' }, { status: 403 });
    amountCents = price;
  } else {
    amountCents = priceForResolved(resolved);
  }

  if (amountCents <= 0) {
    return NextResponse.json({ error: 'This path is free — use submit endpoint.' }, { status: 400 });
  }

  // Resolve the member who will own the RSVP + receive Stripe receipt.
  let rsvpMember: { id: string; email: string };
  if (resolved.kind === 'guest') {
    if (!body.guestEmail || !body.guestName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }
    const guest = await findOrCreateGuestMember(workspaceId, body.guestEmail, body.guestName);
    rsvpMember = { id: guest.id, email: guest.email };
  } else {
    // Member path: userId + Member row required.
    if (!member) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    rsvpMember = { id: member.id, email: member.email };
  }

  if (!(await hasCapacity(workspaceId, evt.id, event.capacity))) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }

  // Reuse existing held PI if present and still usable.
  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId: evt.id, memberId: rsvpMember.id },
    select: { id: true, ticketStatus: true, stripePaymentIntentId: true },
  });
  if (existing?.ticketStatus === 'confirmed') {
    return NextResponse.json({ error: 'Already reserved' }, { status: 409 });
  }
  if (existing?.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
      return NextResponse.json({
        clientSecret: pi.client_secret,
        rsvpId: existing.id,
        amountCents: pi.amount ?? amountCents,
      });
    }
    if (pi.status !== 'canceled' && pi.status !== 'succeeded') {
      await stripe.paymentIntents.cancel(existing.stripePaymentIntentId).catch(() => {});
    }
  }

  // Authorize-and-hold: capture_method: 'manual' — payment is held, not captured.
  // Operator approves → capture; operator rejects → cancel PI.
  //
  // Idempotency key scoped to (workspace, event, member) so a guest double-tap
  // or network retry resolves to the same Stripe PaymentIntent instead of
  // minting a second live 7-day card hold. Mirrors the member route
  // (app/api/m/events/[slug]/access/payment-intent/route.ts).
  const idempotencyKey = `pi-${workspaceId}-${evt.id}-${rsvpMember.id}`;
  const pi = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'usd',
      capture_method: 'manual',
      description: event.title,
      receipt_email: rsvpMember.email,
      automatic_payment_methods: { enabled: true },
      metadata: { workspaceId, eventId: evt.id, memberId: rsvpMember.id, slug },
    },
    { idempotencyKey },
  );

  let rsvpId: string;
  if (existing) {
    const updated = await db.rSVP.update({
      where: { id: existing.id },
      data: {
        stripePaymentIntentId: pi.id,
        paymentStatus: 'AUTHORIZED',
        amountCents,
        ticketStatus: 'held',
        tierId: resolvedTierId ?? null,
        customAnswers: body.customAnswers ?? undefined,
        guestEmail: resolved.kind === 'guest' ? body.guestEmail : null,
        guestName: resolved.kind === 'guest' ? body.guestName : null,
      },
    });
    rsvpId = updated.id;
  } else {
    const created = await db.rSVP.create({
      data: {
        workspaceId,
        eventId: evt.id,
        memberId: rsvpMember.id,
        status: 'CONFIRMED',
        ticketStatus: 'held',
        stripePaymentIntentId: pi.id,
        paymentStatus: 'AUTHORIZED',
        amountCents,
        tierId: resolvedTierId ?? null,
        customAnswers: body.customAnswers ?? undefined,
        guestEmail: resolved.kind === 'guest' ? body.guestEmail : null,
        guestName: resolved.kind === 'guest' ? body.guestName : null,
      },
    });
    rsvpId = created.id;
  }

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId ?? `guest:${rsvpMember.email}`,
      action: 'rsvp.payment_initiated',
      entityType: 'RSVP',
      entityId: rsvpId,
      metadata: { flow: resolved.flow, viewer, surface: 'public' },
    },
  });

  return NextResponse.json({
    clientSecret: pi.client_secret,
    rsvpId,
    amountCents,
  });
}
