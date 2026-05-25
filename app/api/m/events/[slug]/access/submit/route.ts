import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { resolveViewer, flowNeedsApproval } from '@/lib/event-access';
import {
  loadAccessContext,
  priceForResolved,
  findOrCreateGuestMember,
  findOrCreateOperatorMember,
  hasCapacity,
} from '@/lib/event-access-submit';
import { emitEvent } from '@/lib/emit-event';

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
  if (!needsApproval && !(await hasCapacity(workspaceId, evt.id, event.capacity))) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }

  const ticketStatus = needsApproval ? 'pending_approval' : 'confirmed';
  const rsvpStatus = needsApproval ? 'WAITLISTED' : 'CONFIRMED';

  // Upsert RSVP (memberId is the unique-with-event partner).
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
    metadata: { ticketStatus, viewer: String(viewer), flow: String(resolved.flow) },
  });

  return NextResponse.json({
    rsvpId,
    ticketStatus,
    memberQrCode: rsvpMember.memberQrCode,
  });
}
