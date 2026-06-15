import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';
import { findOrCreateGuestMember } from '@/lib/event-access-submit';

const COMP_TYPES = ['Sponsor', 'Vendor', 'Staff', 'Press', 'Partner', 'Other'] as const;

const BodySchema = z.object({
  firstName: z.string().trim().min(1, 'First name required'),
  lastName: z.string().trim().min(1, 'Last name required'),
  email: z.string().trim().email('Valid email required'),
  compType: z.enum(COMP_TYPES),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id: eventId } = await params;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true, title: true, slug: true, startAt: true, location: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const { firstName, lastName, email, compType, note } = parsed.data;
  const fullName = `${firstName} ${lastName}`.trim();

  const member = await findOrCreateGuestMember(workspaceId, email, fullName);

  // Comp recipients need a scannable QR code at the door.
  let memberQrCode = member.memberQrCode;
  if (!memberQrCode) {
    memberQrCode = `nobc_${randomUUID()}`;
    await db.member.update({ where: { id: member.id }, data: { memberQrCode } });
  }

  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId, memberId: member.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'This person already has a registration for this event.' },
      { status: 409 },
    );
  }

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: member.id,
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
      origin: 'comp',
      isComp: true,
      compType,
      guestEmail: email.trim().toLowerCase(),
      guestName: fullName,
    },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'rsvp.comp_issued',
      entityType: 'RSVP',
      entityId: rsvp.id,
      metadata: { compType, email: email.trim().toLowerCase(), note: note ?? null },
    },
  });

  if (process.env.RESEND_API_KEY) {
    try {
      const { resend } = await import('@/lib/resend');
      const { compTicketEmail } = await import('@/lib/email-templates');
      await resend.emails.send({
        from: 'NoBC <team@thenobadcompany.com>',
        to: email.trim(),
        ...compTicketEmail(fullName, event.title, event.startAt, event.location, rsvp.id),
      });
    } catch (err) {
      console.error('[comp] confirmation email failed:', err);
    }
  }

  return NextResponse.json({ ok: true, rsvpId: rsvp.id });
}
