import { db } from '@/lib/db';
import { resolveMember } from '@/lib/member-identity';

type AttachParams = {
  workspaceId: string;
  clerkUserId: string | null;
  eventId: string | undefined;
  email: string;
  fullName: string;
  phone?: string | undefined;
  actorIdForAudit: string;
};

/**
 * After a membership application is submitted: optionally create an event RSVP
 * when `eventId` is present, user is signed in, and the event is TICKETED + approvalRequired.
 */
export async function attachEventRsvpAfterApply(p: AttachParams): Promise<void> {
  const { workspaceId, clerkUserId, eventId, email, fullName, phone, actorIdForAudit } = p;
  if (!eventId?.trim() || !clerkUserId) return;

  const event = await db.event.findFirst({
    where: {
      id: eventId.trim(),
      workspaceId,
      status: 'PUBLISHED',
      approvalRequired: true,
    },
    select: {
      id: true,
      approvalRequired: true,
      capacity: true,
    },
  });
  if (!event) return;

  // Resolve through the canonical path — GUEST + a minted QR (QR law). The
  // applicant's Application carries the "applied" signal; the Member stays GUEST
  // until the approval gate promotes it.
  const member = await resolveMember({
    workspaceId,
    email,
    name: fullName,
    clerkUserId,
    phone,
    source: 'apply_event_rsvp',
  });

  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId: event.id, memberId: member.id },
  });
  if (existing) return;

  if (event.capacity) {
    const taken = await db.rSVP.count({
      where: {
        workspaceId,
        eventId: event.id,
        ticketStatus: { in: ['confirmed', 'held'] },
      },
    });
    if (taken >= event.capacity) return;
  }

  if (event.approvalRequired) {
    const rsvp = await db.rSVP.create({
      data: {
        workspaceId,
        eventId: event.id,
        memberId: member.id,
        status: 'WAITLISTED',
        ticketStatus: 'held',
      },
    });
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: actorIdForAudit,
        action: 'rsvp.created',
        entityType: 'RSVP',
        entityId: rsvp.id,
        metadata: { ticketStatus: 'held', origin: 'apply_approval_holds_ticket' },
      },
    });
    return;
  }

  // SUBMIT_CONFIRMS_ENTRY — ticket confirms on successful application submit.
  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId: event.id,
      memberId: member.id,
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
    },
  });
  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: actorIdForAudit,
      action: 'rsvp.created',
      entityType: 'RSVP',
      entityId: rsvp.id,
      metadata: { ticketStatus: 'confirmed', origin: 'apply_submit_confirms_entry' },
    },
  });
}
