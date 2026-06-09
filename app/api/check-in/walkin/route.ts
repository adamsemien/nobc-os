import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { findOrCreateGuestMember } from '@/lib/event-access-submit';
import { sendTemplatedEmail } from '@/lib/email';
import { bearerToken, verifyCheckInToken } from '@/lib/check-in-token';

/** Walk-in registration from the check-in PWA.
 *
 *  Creates (or reuses) a member by email, attaches an RSVP, marks them as
 *  checked in immediately, and optionally sends the walkin.welcome email. */
const BodySchema = z.object({
  eventSlug: z.string().min(1),
  workspaceSlug: z.string().min(1),
  name: z.string().trim().min(1, 'Name required'),
  email: z.string().trim().email('Valid email required'),
  phone: z.string().trim().optional(),
  plusOne: z.boolean().optional(),
  plusOneName: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const scope = verifyCheckInToken(bearerToken(req.headers.get('authorization')));
  if (!scope) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const { name, email, phone, plusOne, plusOneName } = parsed.data;

  // Event + workspace come from the token scope, not the request body — a token
  // can only register walk-ins for its own event in its own workspace.
  const workspace = { id: scope.workspaceId };
  const event = await db.event.findFirst({
    where: { id: scope.eventId, workspaceId: scope.workspaceId },
    select: { id: true, title: true, plusOnesAllowed: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Use the same helper Apply uses — keeps guest members coherent across surfaces.
  const memberSlim = await findOrCreateGuestMember(workspace.id, email, name);
  const memberFull = await db.member.findUnique({
    where: { id: memberSlim.id },
    select: { id: true, email: true, firstName: true, lastName: true, status: true, phone: true },
  });
  const member = memberFull ?? { ...memberSlim, status: 'GUEST' as const, phone: null as string | null };

  // Walk-ins resolve to GUEST and are checked in — they are NOT auto-approved.
  // APPROVED is assigned only through the approval gate (locked decision 2026-06-06).
  if (phone && !member.phone) {
    await db.member.update({ where: { id: member.id }, data: { phone } });
  }

  // Check if they already have an RSVP — if so, just mark as checked in.
  const existing = await db.rSVP.findFirst({
    where: { workspaceId: workspace.id, eventId: event.id, memberId: member.id },
    select: { id: true, checkedIn: true },
  });

  let rsvpId: string;
  if (existing) {
    if (!existing.checkedIn) {
      await db.rSVP.update({
        where: { id: existing.id },
        data: {
          checkedIn: true,
          checkedInAt: new Date(),
          status: 'CONFIRMED',
          ticketStatus: 'confirmed',
        },
      });
    }
    rsvpId = existing.id;
  } else {
    const rsvp = await db.rSVP.create({
      data: {
        workspaceId: workspace.id,
        eventId: event.id,
        memberId: member.id,
        status: 'CONFIRMED',
        ticketStatus: 'confirmed',
        origin: 'walkin',
        checkedIn: true,
        checkedInAt: new Date(),
        guestEmail: email.toLowerCase(),
        guestName: name,
        plusOneName: plusOne && plusOneName ? plusOneName : null,
      },
    });
    rsvpId = rsvp.id;
  }

  await db.auditEvent.create({
    data: {
      workspaceId: workspace.id,
      action: 'rsvp.walkin_added',
      entityType: 'RSVP',
      entityId: rsvpId,
      metadata: { eventId: event.id, email: email.toLowerCase(), plusOne: !!plusOne },
    },
  });

  // Fire-and-forget welcome — honors EmailTemplate.enabled.
  void sendTemplatedEmail(workspace.id, 'walkin.welcome', email, {
    member: { firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') },
    event: { title: event.title },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    rsvpId,
    member: { id: member.id, firstName: member.firstName, lastName: member.lastName, email: member.email },
  });
}
