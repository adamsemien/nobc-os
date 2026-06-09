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

  // Atomic capacity gate + create — same race class as submitMemberRsvp:
  // 'held' seats consume capacity, so check-then-create must be one unit.
  // (SUBMIT_CONFIRMS_ENTRY branch: ticket confirms on successful submit.)
  const ticketStatus = event.approvalRequired ? 'held' : 'confirmed';
  const rsvp = await db.$transaction(async (tx) => {
    if (event.capacity) {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;
      const taken = await tx.rSVP.count({
        where: {
          workspaceId,
          eventId: event.id,
          ticketStatus: { in: ['confirmed', 'held'] },
        },
      });
      if (taken >= event.capacity) return null;
    }
    return tx.rSVP.create({
      data: {
        workspaceId,
        eventId: event.id,
        memberId: member.id,
        status: event.approvalRequired ? 'WAITLISTED' : 'CONFIRMED',
        ticketStatus,
      },
    });
  });
  if (!rsvp) return;

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: actorIdForAudit,
      action: 'rsvp.created',
      entityType: 'RSVP',
      entityId: rsvp.id,
      metadata: {
        ticketStatus,
        origin: event.approvalRequired ? 'apply_approval_holds_ticket' : 'apply_submit_confirms_entry',
      },
    },
  });
}
