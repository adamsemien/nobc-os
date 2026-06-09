import { db } from './db';
import { resend } from './resend';
import { waitlistPromotedEmail } from './email-templates';

export async function promoteFromWaitlist(eventId: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, slug: true, workspaceId: true },
  });
  if (!event) return;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Claim the next entry atomically. The Event row lock serializes concurrent
  // promotes — two cancels landing together used to both pick the same entry,
  // double-notify it, and lose the second promotion. The email stays outside
  // the transaction so the lock is never held across network I/O.
  const entry = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    const next = await tx.waitlistEntry.findFirst({
      where: { workspaceId: event.workspaceId, eventId, notifiedAt: null },
      orderBy: { position: 'asc' },
    });
    if (!next) return null;
    await tx.waitlistEntry.update({
      where: { id: next.id },
      data: { notifiedAt: new Date(), expiresAt },
    });
    return next;
  });
  if (!entry) return;

  if (process.env.RESEND_API_KEY) {
    const { subject, html } = waitlistPromotedEmail(entry.name, event.title, event.slug);
    await resend.emails.send({
      from: 'NoBC <team@thenobadcompany.com>',
      to: entry.email,
      subject,
      html,
    }).catch(err => console.error('[waitlist] email failed:', err));
  }
}

export async function cancelRsvp(rsvpId: string, workspaceId: string): Promise<void> {
  const rsvp = await db.rSVP.findFirst({ where: { id: rsvpId, workspaceId } });
  if (!rsvp) throw new Error('RSVP not found');

  // Conditional flip makes cancel idempotent: only the call that actually
  // releases the seat audits and triggers a promotion, so a double-cancel
  // can't promote two people for one freed seat.
  const cancelled = await db.rSVP.updateMany({
    where: { id: rsvpId, workspaceId, ticketStatus: { not: 'cancelled' } },
    data: { ticketStatus: 'cancelled', status: 'DECLINED' },
  });
  if (cancelled.count === 0) return;

  await db.auditEvent.create({
    data: {
      workspaceId,
      action: 'rsvp.cancelled',
      entityType: 'RSVP',
      entityId: rsvpId,
    },
  });

  await promoteFromWaitlist(rsvp.eventId);
}
