import { db } from './db';

/**
 * Data resolution for the public, no-login ticket page (/ticket/[rsvpId]).
 *
 * Every NoBC buyer is an unauthenticated guest, so this page is reached with no
 * session and no event slug. The unguessable rsvpId cuid IS the capability token
 * - the same trust model as the public /api/qr/[id] image endpoint this page
 * embeds. There is no auth workspace to pre-scope by and no slug to derive one
 * from, so we resolve the RSVP by id alone and read the event + member THROUGH
 * the relation: the values returned are always the ones bound to that exact
 * RSVP, so a foreign id can only ever surface its own (correct) event. We never
 * select or return the member's memberQrCode - the QR reaches the page solely as
 * the hosted /api/qr/[rsvpId] image, so the door credential never enters markup.
 */

// Same bounded guard as app/api/qr/[id]/route.ts: cuid / cuid2 / uuid shapes
// only. Rejects junk and oversized input before any DB call.
export const TICKET_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export type TicketView = {
  rsvpId: string;
  eventTitle: string;
  startAt: Date;
  location: string | null;
  firstName: string | null;
};

// Events run from Austin; render every date/time in Central (America/Chicago),
// matching lib/email-templates.ts. Without an explicit zone these render in the
// server zone (UTC on Vercel), turning an evening event into a next-day 1:00 AM.
export function formatTicketDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
}

export function formatTicketTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
}

export async function resolveTicketView(rsvpId: string): Promise<TicketView | null> {
  if (!rsvpId || !TICKET_ID_RE.test(rsvpId)) return null;

  try {
    const rsvp = await db.rSVP.findUnique({
      where: { id: rsvpId },
      select: {
        event: { select: { title: true, startAt: true, location: true } },
        member: { select: { firstName: true } },
      },
    });
    if (!rsvp?.event) return null;

    return {
      rsvpId,
      eventTitle: rsvp.event.title,
      startAt: rsvp.event.startAt,
      location: rsvp.event.location,
      firstName: rsvp.member?.firstName ?? null,
    };
  } catch (err) {
    // Fail closed, mirroring /api/qr: a DB error must not 500 a public page.
    console.error('[ticket-view] resolve failed', { rsvpId, err });
    return null;
  }
}
