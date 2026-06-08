import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { resolveMember } from '@/lib/member-identity';
import { logEngagementEvent } from '@/lib/engagement';
import { resend } from '@/lib/resend';

const BodySchema = z.object({
  eventId: z.string().min(1),
  guestName: z.string().trim().min(1, 'guestName required').max(100, 'guestName too long'),
  guestEmail: z.string().trim().email('Valid guestEmail required').max(200),
});

/** Escape user-supplied strings before interpolating into transactional email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const { eventId, guestName, guestEmail } = parsed.data;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: 'PUBLISHED', plusOnesAllowed: true },
    select: { id: true, title: true, slug: true, startAt: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found or plus-ones not allowed' }, { status: 404 });

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true, approved: true, firstName: true, lastName: true },
  });
  if (!member?.approved) return NextResponse.json({ error: 'Members only' }, { status: 403 });

  const hostRsvp = await db.rSVP.findFirst({
    where: { workspaceId, eventId, memberId: member.id, ticketStatus: 'confirmed' },
  });
  if (!hostRsvp) return NextResponse.json({ error: 'You must RSVP first' }, { status: 409 });

  const existingPlusOne = await db.rSVP.findFirst({
    where: { workspaceId, eventId, plusOneOfMemberId: member.id },
  });
  if (existingPlusOne) {
    return NextResponse.json({ error: 'Already have a plus-one for this event' }, { status: 409 });
  }

  // Resolve the guest through the canonical path — a plus-one is a GUEST, never
  // APPROVED. (Closes the approval-bypass: this route previously minted the guest
  // with status=APPROVED, approved=true.)
  const guest = await resolveMember({ workspaceId, email: guestEmail, name: guestName, source: 'plus_one' });

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: guest.id,
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
      origin: 'plus_one',
      plusOneOfMemberId: member.id,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.plus_one_added',
      entityType: 'RSVP',
      entityId: rsvp.id,
    },
  });

  // CRM timeline signal for the guest — isolated, fire-and-forget.
  void logEngagementEvent({
    workspaceId,
    memberId: guest.id,
    eventType: 'plus_one_added',
    eventId,
  });

  if (process.env.RESEND_API_KEY) {
    const hostName = `${member.firstName} ${member.lastName}`.trim();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const eventUrl = `${appUrl}/m/events/${event.slug}`;
    await resend.emails.send({
      from: 'NoBC <team@thenobadcompany.com>',
      to: guestEmail,
      subject: `You're on the guest list for ${event.title}`,
      html: `<p>Hi ${escapeHtml(guestName)},</p>
<p>You've been added to the guest list for <strong>${escapeHtml(event.title)}</strong> by ${escapeHtml(hostName)}.</p>
<p>Date: ${new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
<p><a href="${eventUrl}">View event →</a></p>
<p>— No Bad Company</p>`,
    }).catch(err => console.error('[plus-one] email failed:', err));
  }

  return NextResponse.json({ rsvpId: rsvp.id });
}
