import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { runSerializable } from '@/lib/serializable-retry';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { resolveViewer, flowNeedsApproval } from '@/lib/event-access';
import {
  loadAccessContext,
  priceForResolved,
  findOrCreateGuestMember,
  findOrCreateOperatorMember,
} from '@/lib/event-access-submit';
import { emitEvent } from '@/lib/emit-event';
import { alert } from '@/lib/alerting';

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
  // members/operators submit through their session and are not throttled here.
  if (!userId) {
    const rate = publicRateLimit(req, { bucket: 'access-submit', max: 20 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSecs) } },
      );
    }
  }

  // Resolve workspace: prefer member workspace; otherwise look up by slug for guest access.
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
        select: { id: true, status: true, memberQrCode: true, email: true },
      })
    : null;

  // Access is enforced by viewer resolution: a signed-in non-member resolves to the guest
  // path (registers as a guest where Guest Access is on) or to "closed" for member-only
  // events. Only approved members reach the member path.
  // Bypass is a STAFF+ privilege: a READ_ONLY org member must not preview/mint via bypass.
  const isOperator =
    operatorWorkspaceId != null &&
    operatorWorkspaceId === workspaceId &&
    (await isStaff(userId, workspaceId));
  let viewer = resolveViewer(member, userId);
  let ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  // Operator bypass: an operator of this workspace can register as a member to test/preview
  // even when the event would otherwise be closed to them (e.g. member-only, no Member row).
  if (!ctx.ok && ctx.status === 403 && isOperator) {
    viewer = 'member';
    ctx = await loadAccessContext(workspaceId, evt.id, viewer);
  }
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
  let rsvpMember: { id: string; memberQrCode: string | null };
  if (resolved.kind === 'guest') {
    if (!body.guestEmail || !body.guestName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }
    const guest = await findOrCreateGuestMember(workspaceId, body.guestEmail, body.guestName);
    rsvpMember = { id: guest.id, memberQrCode: guest.memberQrCode };
  } else {
    // Member path. An operator without a club Member row gets one minted so their
    // test/preview RSVP has an owner (see findOrCreateOperatorMember).
    let ownerMember: { id: string; memberQrCode: string | null } | null = member;
    if (!ownerMember && isOperator && userId) {
      ownerMember = await findOrCreateOperatorMember(workspaceId, userId);
    }
    if (!ownerMember) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    rsvpMember = { id: ownerMember.id, memberQrCode: ownerMember.memberQrCode };
  }

  // Capacity check (skipped for approval gates — they create pending requests, not held seats).
  const needsApproval = flowNeedsApproval(resolved.flow);
  const ticketStatus = needsApproval ? 'pending_approval' : 'confirmed';
  const rsvpStatus = needsApproval ? 'WAITLISTED' : 'CONFIRMED';

  // Wrap capacity check + RSVP write in a transaction to prevent the TOCTOU
  // race where two concurrent requests both pass the count check and both write,
  // overselling the last spot. Prisma serializable isolation serializes the
  // count + upsert pair so only one of them can succeed at capacity.
  type UpsertResult =
    | { full: true }
    | { full: false; rsvpId: string; alreadyConfirmed: boolean; existingTicketStatus?: string };

  let txResult: UpsertResult;
  try {
    txResult = await runSerializable<UpsertResult>(db, async (tx) => {
      if (!needsApproval && event.capacity) {
        const taken = await tx.rSVP.count({
          where: { workspaceId, eventId: evt.id, ticketStatus: { in: ['confirmed', 'held'] } },
        });
        if (taken >= event.capacity) return { full: true };
      }

      const existing = await tx.rSVP.findFirst({
        where: { workspaceId, eventId: evt.id, memberId: rsvpMember.id },
        select: { id: true, ticketStatus: true },
      });

      if (existing) {
        if (existing.ticketStatus === 'confirmed' || existing.ticketStatus === 'pending_approval') {
          return { full: false, rsvpId: existing.id, alreadyConfirmed: true, existingTicketStatus: existing.ticketStatus };
        }
        const updated = await tx.rSVP.update({
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
        return { full: false, rsvpId: updated.id, alreadyConfirmed: false };
      }

      const created = await tx.rSVP.create({
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
      return { full: false, rsvpId: created.id, alreadyConfirmed: false };
    });
  } catch (err) {
    void alert({
      severity: 'error',
      event: 'access.submit.transaction_failed',
      workspaceId,
      context: {
        eventId: evt.id,
        slug,
        viewer: String(viewer),
        flow: String(resolved.flow),
        ticketStatus,
        errorClass: err instanceof Error ? err.constructor.name : 'unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[access/submit] RSVP transaction failed', { workspaceId, eventId: evt.id, err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (txResult.full) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }

  const rsvpId = txResult.rsvpId;
  if (txResult.alreadyConfirmed) {
    return NextResponse.json({
      rsvpId,
      ticketStatus: txResult.existingTicketStatus ?? ticketStatus,
      memberQrCode: rsvpMember.memberQrCode,
    });
  }

  await emitEvent({
    workspaceId,
    actorId: userId ?? `guest:${body.guestEmail ?? 'unknown'}`,
    action: 'rsvp.created',
    entityType: 'RSVP',
    entityId: rsvpId,
    metadata: { ticketStatus, viewer: String(viewer), flow: String(resolved.flow) },
  });

  return NextResponse.json({
    rsvpId,
    ticketStatus,
    memberQrCode: rsvpMember.memberQrCode,
  });
}
