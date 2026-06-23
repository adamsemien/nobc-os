/**
 * Public event access submit — /api/e/[slug]/access/submit
 *
 * Mirrors /api/m/events/[slug]/access/submit/route.ts with these differences:
 *   - No operator bypass (isOperator check removed entirely)
 *   - No getMemberWorkspaceId from Clerk session — workspace resolved via
 *     resolvePublishedEventBySlug (F4: two-step, never from client input)
 *   - auth() called but userId may be null — no redirect
 *   - Guest path always available; member path requires userId + approved Member
 *   - Sends confirmation email via sendGuestAccessConfirmation after RSVP creation
 *     for both 'confirmed' and 'pending_approval' states
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { resolveViewer, flowNeedsApproval } from '@/lib/event-access';
import {
  loadAccessContext,
  priceForResolved,
  findOrCreateGuestMember,
  hasCapacity,
} from '@/lib/event-access-submit';
import { resolvePublishedEventBySlug } from '@/lib/public-event-loader';
import { emitEvent } from '@/lib/emit-event';
import { sendGuestAccessConfirmation } from '@/emails/GuestAccessConfirmation';

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

  // Abuse cap on the anonymous guest path (the public surface). Signed-in
  // members submit through their session and are not throttled here.
  if (!userId) {
    const rate = publicRateLimit(req, { bucket: 'access-submit', max: 20 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSecs) } },
      );
    }
  }

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
        select: { id: true, status: true, memberQrCode: true, email: true },
      })
    : null;

  // Viewer resolution: approved member → 'member', signed-in non-member or guest
  // email → 'guest', unauthenticated with no email context → 'anon'.
  // No operator bypass — this is a public route.
  const viewer = resolveViewer(member, userId);
  const ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { resolved, event } = ctx;
  const price = priceForResolved(resolved);
  if (price > 0) {
    return NextResponse.json(
      { error: 'This path requires payment — use payment-intent endpoint.' },
      { status: 400 },
    );
  }

  // Resolve the member who will own the RSVP.
  let rsvpMember: { id: string; memberQrCode: string | null; email: string };
  if (resolved.kind === 'guest') {
    if (!body.guestEmail || !body.guestName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }
    const guest = await findOrCreateGuestMember(workspaceId, body.guestEmail, body.guestName);
    rsvpMember = { id: guest.id, memberQrCode: guest.memberQrCode, email: guest.email };
  } else {
    // Member path: userId + approved Member row required.
    if (!member) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    rsvpMember = { id: member.id, memberQrCode: member.memberQrCode, email: member.email };
  }

  // Capacity check (skipped for approval gates — pending requests don't hold seats).
  const needsApproval = flowNeedsApproval(resolved.flow);
  if (!needsApproval && !(await hasCapacity(workspaceId, evt.id, event.capacity))) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }

  const ticketStatus = needsApproval ? 'pending_approval' : 'confirmed';
  const rsvpStatus = needsApproval ? 'WAITLISTED' : 'CONFIRMED';

  // Upsert RSVP.
  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId: evt.id, memberId: rsvpMember.id },
    select: { id: true, ticketStatus: true },
  });

  let rsvpId: string;
  if (existing) {
    if (existing.ticketStatus === 'confirmed' || existing.ticketStatus === 'pending_approval') {
      return NextResponse.json({
        rsvpId: existing.id,
        ticketStatus: existing.ticketStatus,
        memberQrCode: rsvpMember.memberQrCode,
      });
    }
    const updated = await db.rSVP.update({
      where: { id: existing.id },
      data: {
        status: rsvpStatus,
        ticketStatus,
        tierId: body.tierId ?? null,
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
        status: rsvpStatus,
        ticketStatus,
        tierId: body.tierId ?? null,
        customAnswers: body.customAnswers ?? undefined,
        guestEmail: resolved.kind === 'guest' ? body.guestEmail : null,
        guestName: resolved.kind === 'guest' ? body.guestName : null,
      },
    });
    rsvpId = created.id;
  }

  await emitEvent({
    workspaceId,
    actorId: userId ?? `guest:${body.guestEmail ?? 'unknown'}`,
    action: 'rsvp.created',
    entityType: 'RSVP',
    entityId: rsvpId,
    metadata: { ticketStatus, viewer: String(viewer), flow: String(resolved.flow), surface: 'public' },
  });

  // Send confirmation email for 'confirmed' and 'pending_approval' states.
  // Fire-and-forget: email failure must not break the RSVP response.
  if (ticketStatus === 'confirmed' || ticketStatus === 'pending_approval') {
    const emailVariant = ticketStatus === 'confirmed' ? 'confirmed' : 'pending_approval';

    // QR is delivered as a hosted <img> (/api/qr/{rsvpId}) — Gmail/Outlook reject
    // data: URIs — so we pass only whether the member has a scannable QR.
    sendGuestAccessConfirmation({
      to: rsvpMember.email,
      variant: emailVariant,
      eventName: event.title,
      eventDate: event.startAt,
      eventLocation: event.location,
      rsvpId,
      qrAvailable: Boolean(rsvpMember.memberQrCode),
      workspaceId,
    }).catch((err) => {
      console.error('[public-submit] sendGuestAccessConfirmation failed', { rsvpId, err });
    });
  }

  return NextResponse.json({
    rsvpId,
    ticketStatus,
    memberQrCode: rsvpMember.memberQrCode,
  });
}
