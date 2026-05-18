import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getOrCreateMemberFromClerk, type ClerkMemberRow } from '@/lib/clerk-member';

export type RsvpSubmitBody = {
  eventId: string;
  customAnswers?: Record<string, string | boolean | number | null>;
};

type MemberRow = ClerkMemberRow;

export async function submitMemberRsvp(
  workspaceId: string,
  clerkUserId: string,
  body: RsvpSubmitBody,
): Promise<
  | { ok: true; rsvpId: string; memberQrCode: string | null; ticketStatus: string }
  | { ok: true; waitlisted: true; position: number }
  | { ok: false; status: number; error: string }
> {
  const { eventId, customAnswers } = body;
  if (!eventId) return { ok: false, status: 400, error: 'eventId required' };

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: 'PUBLISHED' },
    select: {
      id: true,
      accessMode: true,
      applyMode: true,
      approvalRequired: true,
      capacity: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
    },
  });
  if (!event) return { ok: false, status: 404, error: 'Event not found' };

  let member = await db.member.findFirst({
    where: { workspaceId, clerkUserId },
    select: { id: true, approved: true, memberQrCode: true, firstName: true, lastName: true },
  });

  if (!member && event.accessMode === 'OPEN') {
    member = await getOrCreateMemberFromClerk(workspaceId, clerkUserId);
  }
  if (!member) {
    return { ok: false, status: 403, error: 'Members only' };
  }

  // Red list check
  const clerkUserForRedList = await (await clerkClient()).users.getUser(clerkUserId);
  const memberEmail = clerkUserForRedList.emailAddresses[0]?.emailAddress ?? '';
  const redListed = await db.member.findFirst({
    where: { workspaceId, email: memberEmail, redListed: true },
  });
  if (redListed) {
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: clerkUserId,
        action: 'rsvp.red_list_blocked',
        entityType: 'RSVP',
        entityId: 'blocked',
        metadata: { email: memberEmail },
      },
    });
    // Return success silently — don't reveal to user they're blocked
    return { ok: true, rsvpId: 'blocked', memberQrCode: null, ticketStatus: 'confirmed' };
  }

  if (event.accessMode === 'APPLY_OR_PAY' && !member.approved) {
    if (event.applyMode === 'APPROVAL_HOLDS_TICKET') {
      return {
        ok: false,
        status: 403,
        error:
          'Complete membership application to hold a spot for this event — use Apply with this event linked.',
      };
    }
    return { ok: false, status: 403, error: 'Members only' };
  }

  if (event.accessMode === 'TICKETED' && !member.approved) {
    return { ok: false, status: 403, error: 'Members only' };
  }

  const memberPrice = event.priceInCents ?? 0;
  const needsStripePayment =
    (event.accessMode === 'TICKETED' && memberPrice > 0) ||
    (event.accessMode === 'APPLY_OR_PAY' && member.approved && memberPrice > 0);

  if (needsStripePayment) {
    return {
      ok: false,
      status: 400,
      error: 'This event requires payment — use the checkout flow.',
    };
  }

  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId, memberId: member.id },
  });
  if (existing) {
    if (existing.ticketStatus === 'confirmed') {
      return { ok: false, status: 409, error: 'Already reserved' };
    }
    if (existing.ticketStatus === 'pending_approval') {
      return {
        ok: true,
        rsvpId: existing.id,
        memberQrCode: member.memberQrCode,
        ticketStatus: existing.ticketStatus,
      };
    }
    if (existing.ticketStatus === 'held') {
      return {
        ok: true,
        rsvpId: existing.id,
        memberQrCode: member.memberQrCode,
        ticketStatus: existing.ticketStatus,
      };
    }
  }

  if (event.capacity) {
    const taken = await db.rSVP.count({
      where: {
        workspaceId,
        eventId,
        ticketStatus: { in: ['confirmed', 'held'] },
      },
    });
    if (taken >= event.capacity) {
      const maxPos = await db.waitlistEntry.aggregate({
        where: { workspaceId, eventId },
        _max: { position: true },
      });
      const position = (maxPos._max.position ?? 0) + 1;
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkUserId);
      await db.waitlistEntry.create({
        data: {
          workspaceId,
          eventId,
          memberId: member.id,
          email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
          name: `${member.firstName} ${member.lastName}`.trim(),
          position,
        },
      });
      return { ok: true, waitlisted: true, position };
    }
  }

  const ticketStatus = event.approvalRequired ? 'pending_approval' : 'confirmed';
  const rsvpStatus = event.approvalRequired ? 'WAITLISTED' : 'CONFIRMED';

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: member.id,
      status: rsvpStatus as 'CONFIRMED' | 'WAITLISTED',
      ticketStatus,
      customAnswers: customAnswers ?? undefined,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: clerkUserId,
      action: 'rsvp.created',
      entityType: 'RSVP',
      entityId: rsvp.id,
      metadata: { ticketStatus },
    },
  });

  if (ticketStatus === 'confirmed' && process.env.RESEND_API_KEY) {
    const eventRecord = await db.event.findUnique({
      where: { id: eventId },
      select: { title: true, slug: true, startAt: true, location: true },
    });
    if (eventRecord) {
      const { resend } = await import('./resend');
      const { rsvpConfirmedEmail } = await import('./email-templates');
      const clerkUserForEmail = await (await clerkClient()).users.getUser(clerkUserId);
      const emailAddress = clerkUserForEmail.emailAddresses[0]?.emailAddress;
      const memberName = `${member.firstName} ${member.lastName}`.trim();
      if (emailAddress) {
        resend.emails.send({
          from: 'NoBC <team@thenobadcompany.com>',
          to: emailAddress,
          ...rsvpConfirmedEmail(memberName, eventRecord.title, eventRecord.startAt, eventRecord.location, eventRecord.slug, rsvp.id),
        }).catch(err => console.error('[rsvp] confirmation email failed:', err));
      }
    }
  }

  return {
    ok: true,
    rsvpId: rsvp.id,
    memberQrCode: member.memberQrCode,
    ticketStatus,
  };
}
