import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { resend } from '@/lib/resend';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { eventId: string; guestName: string; guestEmail: string };
  try {
    body = (await req.json()) as { eventId: string; guestName: string; guestEmail: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { eventId, guestName, guestEmail } = body;
  if (!eventId || !guestName?.trim() || !guestEmail?.trim()) {
    return NextResponse.json({ error: 'eventId, guestName, and guestEmail required' }, { status: 400 });
  }

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

  const guestMember = await db.member.findFirst({
    where: { workspaceId, email: guestEmail.trim().toLowerCase() },
  });

  let guestMemberId: string;
  if (guestMember) {
    guestMemberId = guestMember.id;
  } else {
    const [guestFirst, ...guestRest] = guestName.trim().split(' ');
    const newGuest = await db.member.create({
      data: {
        workspaceId,
        clerkUserId: `guest:${eventId}:${Date.now()}`,
        email: guestEmail.trim().toLowerCase(),
        firstName: guestFirst,
        lastName: guestRest.join(' ') || '',
        status: 'APPROVED',
        approved: true,
      },
    });
    guestMemberId = newGuest.id;
  }

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: guestMemberId,
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

  if (process.env.RESEND_API_KEY) {
    const hostName = `${member.firstName} ${member.lastName}`.trim();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const eventUrl = `${appUrl}/m/events/${event.slug}`;
    await resend.emails.send({
      from: 'NoBC <noreply@thenobadcompany.com>',
      to: guestEmail.trim(),
      subject: `You're on the guest list for ${event.title}`,
      html: `<p>Hi ${guestName.trim()},</p>
<p>You've been added to the guest list for <strong>${event.title}</strong> by ${hostName}.</p>
<p>Date: ${new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
<p><a href="${eventUrl}">View event →</a></p>
<p>— No Bad Company</p>`,
    }).catch(err => console.error('[plus-one] email failed:', err));
  }

  return NextResponse.json({ rsvpId: rsvp.id });
}
