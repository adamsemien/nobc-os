import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
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
    const price = resolved.kind === 'guest' ? tier.nonMemberPriceCents : tier.memberPriceCents;
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

  if (!(await hasCapacity(workspaceId, evt.id, event.capacity))) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }

  // Reuse existing held PI if present.
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

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    capture_method: 'manual',
    description: event.title,
    receipt_email: rsvpMember.email,
    automatic_payment_methods: { enabled: true },
    metadata: { workspaceId, eventId: evt.id, memberId: rsvpMember.id, slug },
  });

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
      metadata: { flow: resolved.flow, viewer },
    },
  });

  return NextResponse.json({
    clientSecret: pi.client_secret,
    rsvpId,
    amountCents,
  });
}
