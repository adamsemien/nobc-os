import { db } from '@/lib/db';
import { MemberStatus } from '@prisma/client';

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
 * when `eventId` is present, user is signed in, and the event uses apply_or_pay sub-modes.
 */
export async function attachEventRsvpAfterApply(p: AttachParams): Promise<void> {
  const { workspaceId, clerkUserId, eventId, email, fullName, phone, actorIdForAudit } = p;
  if (!eventId?.trim() || !clerkUserId) return;

  const event = await db.event.findFirst({
    where: {
      id: eventId.trim(),
      workspaceId,
      status: 'PUBLISHED',
      accessMode: 'APPLY_OR_PAY',
      applyMode: { in: ['APPROVAL_HOLDS_TICKET', 'SUBMIT_CONFIRMS_ENTRY'] },
    },
    select: {
      id: true,
      applyMode: true,
      capacity: true,
    },
  });
  if (!event) return;

  const [firstName, ...rest] = fullName.trim().split(' ');
  const lastName = rest.join(' ') || '';

  const member = await db.member.upsert({
    where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    create: {
      workspaceId,
      clerkUserId,
      email: email.trim().toLowerCase(),
      firstName,
      lastName,
      phone: phone?.trim() || undefined,
      status: MemberStatus.PENDING,
      approved: false,
    },
    update: {
      email: email.trim().toLowerCase(),
      firstName,
      lastName,
      phone: phone?.trim() || undefined,
    },
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

  if (event.applyMode === 'APPROVAL_HOLDS_TICKET') {
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
