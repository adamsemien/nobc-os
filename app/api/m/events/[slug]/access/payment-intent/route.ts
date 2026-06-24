import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { runSerializable } from '@/lib/serializable-retry';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { stripe } from '@/lib/stripe';
import { resolveViewer } from '@/lib/event-access';
import {
  loadAccessContext,
  priceForResolved,
  findOrCreateGuestMember,
  findOrCreateOperatorMember,
  hasCapacity,
} from '@/lib/event-access-submit';
import { selectTierPriceCents } from '@/lib/ticketing/pricing';
import { alert } from '@/lib/alerting';

const BodySchema = z.object({
  guestEmail: z.string().email().optional(),
  guestName: z.string().min(1).optional(),
  customAnswers: z.record(z.string(), z.union([z.string(), z.boolean(), z.number(), z.null()])).optional(),
  tierId: z.string().cuid().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    return await handlePost(req, ctx);
  } catch (err) {
    // Last-resort guard: any uncaught throw must still return a JSON body, so the
    // client never receives a non-JSON 500 that breaks its response parsing.
    console.error('[payment-intent] unhandled error', err);
    return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
  }
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { userId } = await auth();

  // operatorWorkspaceId (resolved from Clerk org membership) doubles as the "is operator
  // of this workspace" signal used by the operator bypass below.
  const operatorWorkspaceId = userId ? await getMemberWorkspaceId(userId) : null;
  let workspaceId: string | null = operatorWorkspaceId;
  if (!workspaceId) {
    const evt = await db.event.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { workspaceId: true },
    });
    workspaceId = evt?.workspaceId ?? null;
  }
  if (!workspaceId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const evt = await db.event.findFirst({
    where: { workspaceId, slug, status: 'PUBLISHED' },
    select: { id: true },
  });
  if (!evt) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const member = userId
    ? await db.member.findFirst({
        where: { workspaceId, clerkUserId: userId },
        select: { id: true, status: true, email: true, memberQrCode: true },
      })
    : null;

  // Access is enforced by viewer resolution: a signed-in non-member resolves to the guest
  // path or to "closed" for member-only events. Only approved members reach the member path.
  // Bypass is a STAFF+ privilege: a READ_ONLY org member must not preview/mint comp via bypass.
  const isOperator =
    operatorWorkspaceId != null &&
    operatorWorkspaceId === workspaceId &&
    (await isStaff(userId, workspaceId));
  let viewer = resolveViewer(member, userId);
  let ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  // Operator bypass: an operator of this workspace can register as a member to test/preview
  // even when the event would otherwise be closed to them.
  if (!ctx.ok && ctx.status === 403 && isOperator) {
    viewer = 'member';
    ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  }
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { resolved, event } = ctx;

  // Operator bypass (paid path): operators of this workspace complete a paid RSVP WITHOUT a
  // Stripe charge so they can test/preview the full flow end-to-end. This mints a
  // COMPLIMENTARY ticket — it is an operator-only test/preview path, NOT a public free tier;
  // real attendees still go through payment below.
  if (isOperator) {
    const owner = member ?? (userId ? await findOrCreateOperatorMember(workspaceId, userId) : null);
    if (!owner) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!(await hasCapacity(workspaceId, evt.id, event.capacity))) {
      return NextResponse.json({ error: 'Event is full' }, { status: 409 });
    }
    const existingComp = await db.rSVP.findFirst({
      where: { workspaceId, eventId: evt.id, memberId: owner.id },
      select: { id: true },
    });
    const rsvp = existingComp
      ? await db.rSVP.update({
          where: { id: existingComp.id },
          data: {
            status: 'CONFIRMED',
            ticketStatus: 'confirmed',
            isComp: true,
            origin: 'comp',
            compType: 'Staff',
            paymentStatus: 'COMP',
            amountCents: 0,
            stripePaymentIntentId: null,
            tierId: body.tierId ?? null,
            customAnswers: body.customAnswers ?? undefined,
          },
        })
      : await db.rSVP.create({
          data: {
            workspaceId,
            eventId: evt.id,
            memberId: owner.id,
            status: 'CONFIRMED',
            ticketStatus: 'confirmed',
            isComp: true,
            origin: 'comp',
            compType: 'Staff',
            paymentStatus: 'COMP',
            amountCents: 0,
            tierId: body.tierId ?? null,
            customAnswers: body.customAnswers ?? undefined,
          },
        });
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId ?? 'operator',
        action: 'rsvp.operator_comp',
        entityType: 'RSVP',
        entityId: rsvp.id,
        metadata: { flow: resolved.flow, operatorBypass: true },
      },
    });
    return NextResponse.json({
      comp: true,
      rsvpId: rsvp.id,
      ticketStatus: 'confirmed',
      memberQrCode: owner.memberQrCode,
    });
  }

  // Tier-based pricing: if a tierId is provided, use the tier price.
  let amountCents: number;
  const resolvedTierId: string | undefined = body.tierId;
  if (body.tierId) {
    const tier = await db.ticketTier.findFirst({
      where: { id: body.tierId, workspaceId, eventId: evt.id, manuallyClosed: false },
      select: { memberPriceCents: true, nonMemberPriceCents: true },
    });
    if (!tier) return NextResponse.json({ error: 'Ticket tier not found' }, { status: 404 });
    const price = selectTierPriceCents(resolved.kind, tier);
    if (price == null) return NextResponse.json({ error: 'Tier not available for this access level' }, { status: 403 });
    amountCents = price;
  } else {
    amountCents = priceForResolved(resolved);
  }

  if (amountCents <= 0) {
    return NextResponse.json({ error: 'This path is free — use submit endpoint.' }, { status: 400 });
  }

  let rsvpMember: { id: string; email: string };
  if (resolved.kind === 'guest') {
    if (!body.guestEmail || !body.guestName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }
    const guest = await findOrCreateGuestMember(workspaceId, body.guestEmail, body.guestName);
    rsvpMember = { id: guest.id, email: guest.email };
  } else {
    if (!member) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    rsvpMember = { id: member.id, email: member.email };
  }

  // Reuse existing held PI if present — handle idempotent retries before
  // touching capacity, so a retry for an in-progress payment never re-counts
  // against capacity.
  const existingRsvp = await db.rSVP.findFirst({
    where: { workspaceId, eventId: evt.id, memberId: rsvpMember.id },
    select: { id: true, ticketStatus: true, stripePaymentIntentId: true },
  });
  if (existingRsvp?.ticketStatus === 'confirmed') {
    return NextResponse.json({ error: 'Already reserved' }, { status: 409 });
  }
  if (existingRsvp?.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(existingRsvp.stripePaymentIntentId);
    if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
      return NextResponse.json({
        clientSecret: pi.client_secret,
        rsvpId: existingRsvp.id,
        amountCents: pi.amount ?? amountCents,
      });
    }
    if (pi.status !== 'canceled' && pi.status !== 'succeeded') {
      await stripe.paymentIntents.cancel(existingRsvp.stripePaymentIntentId).catch(() => {});
    }
  }

  // Capacity check + RSVP write in a transaction to prevent the TOCTOU race
  // where two concurrent first-time buyers both pass the count check and both
  // write, overselling the last spot.
  if (!existingRsvp && event.capacity) {
    const taken = await db.rSVP.count({
      where: { workspaceId, eventId: evt.id, ticketStatus: { in: ['confirmed', 'held'] } },
    });
    if (taken >= event.capacity) {
      return NextResponse.json({ error: 'Event is full' }, { status: 409 });
    }
  }

  // Idempotency key scoped to (workspace, event, member, amount, capture_method)
  // so concurrent double-submits resolve to the same PaymentIntent, while a
  // genuine change between attempts (tier/price change -> different amount,
  // approvalRequired toggle -> different capture_method) produces a FRESH key.
  // Without amount+mode in the key, Stripe returns the original PI and ignores
  // the new params, charging the stale amount or minting the wrong hold type.
  const captureMethod = event.approvalRequired ? 'manual' : 'automatic';
  const idempotencyKey = `pi-${workspaceId}-${evt.id}-${rsvpMember.id}-${amountCents}-${captureMethod}`;
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
        receipt_email: rsvpMember.email,
        automatic_payment_methods: { enabled: true },
        metadata: { workspaceId, eventId: evt.id, memberId: rsvpMember.id, slug },
      },
      { idempotencyKey },
    );
  } catch (err) {
    void alert({
      severity: 'critical',
      event: 'stripe.payment_intent.create_failed',
      workspaceId,
      context: {
        eventId: evt.id,
        slug,
        amountCents,
        viewer: String(viewer),
        errorClass: err instanceof Error ? err.constructor.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[payment-intent] stripe.paymentIntents.create failed', { workspaceId, eventId: evt.id, err });
    return NextResponse.json({ error: 'Payment setup failed' }, { status: 502 });
  }

  // Write RSVP inside a serializable transaction — the capacity count and RSVP
  // insert are now a single atomic unit, preventing oversell on the last spot.
  let rsvpId: string;
  if (existingRsvp) {
    const updated = await db.rSVP.update({
      where: { id: existingRsvp.id },
      data: {
        stripePaymentIntentId: pi.id,
        paymentStatus: 'PENDING',
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
    let created: { id: string };
    try {
      created = await runSerializable(db, async (tx) => {
        // Re-check capacity inside the transaction to close the race window.
        if (event.capacity) {
          const taken = await tx.rSVP.count({
            where: { workspaceId, eventId: evt.id, ticketStatus: { in: ['confirmed', 'held'] } },
          });
          if (taken >= event.capacity) {
            throw Object.assign(new Error('Event is full'), { code: 'FULL' });
          }
        }
        return tx.rSVP.create({
          data: {
            workspaceId,
            eventId: evt.id,
            memberId: rsvpMember.id,
            status: 'CONFIRMED',
            ticketStatus: 'held',
            stripePaymentIntentId: pi.id,
            paymentStatus: 'PENDING',
            amountCents,
            tierId: resolvedTierId ?? null,
            customAnswers: body.customAnswers ?? undefined,
            guestEmail: resolved.kind === 'guest' ? body.guestEmail : null,
            guestName: resolved.kind === 'guest' ? body.guestName : null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'FULL') {
        // Cancel the PI we just created so it doesn't dangle.
        await stripe.paymentIntents.cancel(pi.id).catch((e) =>
          console.error('[payment-intent] failed to cancel dangling PI after capacity race', { piId: pi.id, err: e }),
        );
        return NextResponse.json({ error: 'Event is full' }, { status: 409 });
      }
      void alert({
        severity: 'error',
        event: 'payment_intent.rsvp_transaction_failed',
        workspaceId,
        context: {
          eventId: evt.id,
          piId: pi.id,
          errorClass: err instanceof Error ? err.constructor.name : 'unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      console.error('[payment-intent] RSVP create transaction failed', { workspaceId, eventId: evt.id, err });
      throw err;
    }
    rsvpId = created.id;
  }

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId ?? `guest:${rsvpMember.email}`,
      action: 'rsvp.payment_initiated',
      entityType: 'RSVP',
      entityId: rsvpId,
      metadata: { flow: resolved.flow, viewer },
    },
  });

  return NextResponse.json({
    clientSecret: pi.client_secret,
    rsvpId,
    amountCents,
  });
}
