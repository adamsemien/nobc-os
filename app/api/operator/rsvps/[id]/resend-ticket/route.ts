import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { requireRole } from '@/lib/operator-role';

/** Re-send the confirmation/QR email for a confirmed access record.
 *
 *  Every QR email send was creation-time fire-and-forget (apply, guest submit,
 *  paid capture webhook, comp, member confirm) with no operator-driven
 *  recovery — a guest who lost the email had no path back to their ticket
 *  (2026-06-26 audit item 3). STAFF-gated, workspace-scoped, audited. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const rsvp = await db.rSVP.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      ticketStatus: true,
      member: {
        select: { firstName: true, lastName: true, email: true, memberQrCode: true },
      },
      event: { select: { title: true, startAt: true, location: true, slug: true } },
    },
  });
  if (!rsvp) return NextResponse.json({ error: 'Access record not found' }, { status: 404 });

  if (rsvp.ticketStatus !== 'confirmed') {
    return NextResponse.json(
      { error: 'Only confirmed access records have a ticket email to resend.' },
      { status: 422 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email is not configured (RESEND_API_KEY unset) — nothing was sent.' },
      { status: 503 },
    );
  }

  const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim() || rsvp.member.email;
  try {
    const { resend } = await import('@/lib/resend');
    const { rsvpConfirmedEmail } = await import('@/lib/email-templates');
    await resend.emails.send({
      from: 'The No Bad Company <team@thenobadcompany.com>',
      to: rsvp.member.email,
      ...rsvpConfirmedEmail(
        name,
        rsvp.event.title,
        rsvp.event.startAt,
        rsvp.event.location,
        rsvp.event.slug,
        rsvp.id,
        !!rsvp.member.memberQrCode,
      ),
    });
  } catch (err) {
    console.error('[resend-ticket] send failed:', { rsvpId: rsvp.id, err });
    return NextResponse.json({ error: 'The email failed to send. Try again.' }, { status: 502 });
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'rsvp.ticket_resent',
    entityType: 'RSVP',
    entityId: rsvp.id,
    metadata: { email: rsvp.member.email },
  });

  return NextResponse.json({ ok: true });
}
