import { db } from './db';
import { resend } from './resend';
import { waitlistPromotedEmail } from './email-templates';

export async function promoteFromWaitlist(eventId: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, slug: true, workspaceId: true },
  });
  if (!event) return;

  const entry = await db.waitlistEntry.findFirst({
    where: { eventId, notifiedAt: null },
    orderBy: { position: 'asc' },
  });
  if (!entry) return;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.waitlistEntry.update({
    where: { id: entry.id },
    data: { notifiedAt: new Date(), expiresAt },
  });

  if (process.env.RESEND_API_KEY) {
    const { subject, html } = waitlistPromotedEmail(entry.name, event.title, event.slug);
    await resend.emails.send({
      from: 'NoBC <noreply@thenobadcompany.com>',
      to: entry.email,
      subject,
      html,
    }).catch(err => console.error('[waitlist] email failed:', err));
  }
}

export async function cancelRsvp(rsvpId: string, workspaceId: string): Promise<void> {
  const rsvp = await db.rSVP.findFirst({ where: { id: rsvpId, workspaceId } });
  if (!rsvp) throw new Error('RSVP not found');

  await db.rSVP.update({
    where: { id: rsvpId },
    data: { ticketStatus: 'cancelled', status: 'DECLINED' },
  });

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
