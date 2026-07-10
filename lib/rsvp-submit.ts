import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getOrCreateMemberFromClerk, type ClerkMemberRow } from '@/lib/clerk-member';
import { logEngagementEvent } from '@/lib/engagement';
import { sendTemplatedEmail, getPlatformBool } from '@/lib/email';
import { gateLifecycleEmail } from '@/lib/comms/lifecycle-gate';

export type RsvpSubmitBody = {
  eventId: string;
  tierId?: string;
  customAnswers?: Record<string, string | boolean | number | null>;
  /** Operator UI-collected plus-one info — only persisted when event.plusOnesAllowed. */
  plusOne?: { name?: string; instagram?: string };
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
  const { eventId, tierId, customAnswers, plusOne } = body;
  if (!eventId) return { ok: false, status: 400, error: 'eventId required' };

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: 'PUBLISHED' },
    select: {
      id: true,
      accessMode: true,
      approvalRequired: true,
      capacity: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
      plusOnesAllowed: true,
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

  if (event.approvalRequired && !member.approved) {
    return {
      ok: false,
      status: 403,
      error:
        'Complete membership application to hold a spot for this event — use Apply with this event linked.',
    };
  }

  if (!event.approvalRequired && !member.approved) {
    return { ok: false, status: 403, error: 'Members only' };
  }

  const memberPrice = event.priceInCents ?? 0;
  const needsStripePayment =
    event.accessMode === 'TICKETED' && memberPrice > 0 && member.approved;

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

  const ticketStatus = event.approvalRequired ? 'pending_approval' : 'confirmed';
  const rsvpStatus = event.approvalRequired ? 'WAITLISTED' : 'CONFIRMED';
  const acceptPlusOne = !!plusOne && event.plusOnesAllowed;
  const memberId = member.id;
  const memberName = `${member.firstName} ${member.lastName}`.trim();

  // Atomic capacity gate + create. The Event row lock serializes concurrent
  // submits so count-then-create can't oversell a capped event and waitlist
  // positions can't collide (audit: non-transactional counters). No network
  // I/O inside the transaction — the email reuses the red-list Clerk lookup.
  const outcome = await db.$transaction(async (tx) => {
    if (event.capacity) {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      const taken = await tx.rSVP.count({
        where: {
          workspaceId,
          eventId,
          ticketStatus: { in: ['confirmed', 'held'] },
        },
      });
      if (taken >= event.capacity) {
        const maxPos = await tx.waitlistEntry.aggregate({
          where: { workspaceId, eventId },
          _max: { position: true },
        });
        const position = (maxPos._max.position ?? 0) + 1;
        await tx.waitlistEntry.create({
          data: {
            workspaceId,
            eventId,
            memberId,
            email: memberEmail,
            name: memberName,
            position,
          },
        });
        return { waitlisted: true as const, position };
      }
    }

    const rsvp = await tx.rSVP.create({
      data: {
        workspaceId,
        eventId,
        memberId,
        status: rsvpStatus as 'CONFIRMED' | 'WAITLISTED',
        ticketStatus,
        tierId: tierId ?? null,
        customAnswers: customAnswers ?? undefined,
        plusOneName: acceptPlusOne && plusOne?.name?.trim() ? plusOne.name.trim() : null,
        plusOneInstagram: acceptPlusOne && plusOne?.instagram?.trim() ? plusOne.instagram.trim() : null,
      },
    });
    return { waitlisted: false as const, rsvp };
  });

  if (outcome.waitlisted) {
    // Fire-and-forget engagement signal — must not block or fail the join.
    logEngagementEvent({
      workspaceId,
      memberId,
      eventType: 'waitlist_joined',
      eventId,
    });
    return { ok: true, waitlisted: true, position: outcome.position };
  }
  const rsvp = outcome.rsvp;

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

  if (ticketStatus === 'confirmed') {
    // Fire-and-forget engagement signal — must not block or fail the RSVP.
    logEngagementEvent({
      workspaceId,
      memberId: member.id,
      eventType: 'rsvp_confirmed',
      eventId,
    });
  }

  if (ticketStatus === 'confirmed') {
    const confirmationEnabled = await getPlatformBool(workspaceId, 'rsvp.send_confirmation', true);
    if (confirmationEnabled) {
      const eventRecord = await db.event.findUnique({
        where: { id: eventId },
        select: { title: true, startAt: true, location: true },
      });
      if (eventRecord) {
        // memberEmail comes from the red-list Clerk lookup above — same user,
        // no second Clerk fetch. Suppression floor is checked before every
        // lifecycle send and fails closed (lib/comms/lifecycle-gate.ts).
        const gate = await gateLifecycleEmail({
          workspaceId,
          email: memberEmail,
          memberId: member.id,
          site: 'rsvp.confirmation',
        });
        if (gate.send) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.thenobadcompany.com';
          sendTemplatedEmail(
            workspaceId,
            'rsvp.confirmation',
            gate.email,
            {
              member: { firstName: member.firstName, lastName: member.lastName },
              event: {
                title: eventRecord.title,
                dateFormatted: eventRecord.startAt.toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  timeZone: 'America/Chicago',
                }),
                timeFormatted: eventRecord.startAt.toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
                }),
                location: eventRecord.location ?? '',
              },
              ticket: { url: `${appUrl}/ticket/${rsvp.id}` },
            },
            [{ memberId: member.id }],
          ).catch(err => console.error('[rsvp] confirmation email failed:', err));
        } else {
          console.info(`[rsvp] confirmation email skipped for rsvp=${rsvp.id}: ${gate.reason}`);
        }
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
