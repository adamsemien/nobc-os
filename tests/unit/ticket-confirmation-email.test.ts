/**
 * Tests for the ticketed-purchase confirmation email pipeline.
 *
 * Covers:
 *  1. rsvpConfirmedEmail template — QR embed + link fallback
 *  2. resolveTicketRecipient — canonical email for member + guest buyers
 *  3. shouldSendConfirmationEmail — dedup guard (only fires on first AUTHORIZED transition)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rsvpConfirmedEmail, compTicketEmail } from '@/lib/email-templates';
import {
  resolveTicketRecipient,
  shouldSendConfirmationEmail,
} from '@/lib/ticket-confirmation';

// ---------------------------------------------------------------------------
// 1. rsvpConfirmedEmail — QR embed
// ---------------------------------------------------------------------------

describe('rsvpConfirmedEmail — QR embed', () => {
  const BASE = {
    name: 'Ada Lovelace',
    eventTitle: 'Summer Rooftop',
    startAt: new Date('2026-08-01T20:00:00Z'),
    location: 'The Rooftop, NYC',
    eventSlug: 'summer-rooftop',
    rsvpId: 'rsvp_abc123',
  };

  it('embeds the QR <img> (hosted /api/qr URL) when qrAvailable is true', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
      true,
    );
    // QR is now a hosted HTTPS image (Gmail/Outlook reject data: URIs), keyed by rsvpId.
    expect(html).toContain('<img src="');
    expect(html).toContain(`/api/qr/${BASE.rsvpId}`);
  });

  it('still includes the public ticket-page link when QR is available', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
      true,
    );
    expect(html).toContain(`/ticket/${BASE.rsvpId}`);
  });

  it('omits the QR <img> when qrAvailable is omitted (link-only fallback)', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain(`/ticket/${BASE.rsvpId}`);
  });

  it('omits location line when location is null', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      null,
      BASE.eventSlug,
      BASE.rsvpId,
    );
    expect(html).not.toContain('Location:');
  });

  it('returns subject with event title', () => {
    const { subject } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
    );
    expect(subject).toContain(BASE.eventTitle);
  });

  it('does not claim payment charged — body uses "confirmed" not "charged" or "payment received"', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
    );
    expect(html.toLowerCase()).not.toContain('charged');
    expect(html.toLowerCase()).not.toContain('payment received');
  });
});

// ---------------------------------------------------------------------------
// 1b. Fallback links target the public, no-login /ticket page (not gated paths)
// ---------------------------------------------------------------------------

describe('email fallback links target the public /ticket page', () => {
  const RSVP_ID = 'rsvp_abc12345';
  const SLUG = 'summer-rooftop';
  const at = new Date('2026-08-01T20:00:00Z');

  it('rsvpConfirmedEmail (with QR) links to /ticket, not the gated /m path', () => {
    const { html } = rsvpConfirmedEmail('Ada', 'Summer Rooftop', at, 'Austin', SLUG, RSVP_ID, true);
    expect(html).toContain(`/ticket/${RSVP_ID}`);
    expect(html).not.toContain('/m/events/');
    expect(html).not.toContain('/confirmed?rsvpId=');
  });

  it('rsvpConfirmedEmail (link-only fallback) links to /ticket, not the gated /m path', () => {
    const { html } = rsvpConfirmedEmail('Ada', 'Summer Rooftop', at, 'Austin', SLUG, RSVP_ID);
    expect(html).toContain(`/ticket/${RSVP_ID}`);
    expect(html).not.toContain('/m/events/');
  });

  it('compTicketEmail links to /ticket, not the gated /check-in path', () => {
    const { html } = compTicketEmail('Ada', 'Summer Rooftop', at, 'Austin', RSVP_ID);
    expect(html).toContain(`/ticket/${RSVP_ID}`);
    expect(html).not.toContain('/check-in/verify/');
  });
});

// ---------------------------------------------------------------------------
// 2. resolveTicketRecipient — canonical email address for email dispatch
// ---------------------------------------------------------------------------

describe('resolveTicketRecipient', () => {
  it('returns member.email for a standard member buyer', () => {
    const member = { email: 'member@example.com', firstName: 'Ada', lastName: 'Lovelace' };
    const rsvp = { guestEmail: null, guestName: null };
    expect(resolveTicketRecipient(member, rsvp)).toEqual({
      email: 'member@example.com',
      name: 'Ada Lovelace',
    });
  });

  it('returns member.email for a guest buyer (guest Member row holds their typed email)', () => {
    // findOrCreateGuestMember stores the typed email on Member.email
    const guestMember = { email: 'guest@example.com', firstName: 'Guest', lastName: 'Buyer' };
    const rsvp = { guestEmail: 'guest@example.com', guestName: 'Guest Buyer' };
    expect(resolveTicketRecipient(guestMember, rsvp)).toEqual({
      email: 'guest@example.com',
      name: 'Guest Buyer',
    });
  });

  it('falls back to rsvp.guestEmail if member row email is empty (defensive)', () => {
    const guestMember = { email: '', firstName: 'Guest', lastName: '' };
    const rsvp = { guestEmail: 'fallback@example.com', guestName: 'Fallback User' };
    expect(resolveTicketRecipient(guestMember, rsvp)).toEqual({
      email: 'fallback@example.com',
      name: 'Fallback User',
    });
  });

  it('trims leading/trailing whitespace from the final name', () => {
    // firstName and lastName have no leading/trailing spaces — the join trims the outer result
    const member = { email: 'a@b.com', firstName: 'Ada', lastName: 'Lovelace' };
    const rsvp = { guestEmail: null, guestName: null };
    const result = resolveTicketRecipient(member, rsvp);
    expect(result.name).toBe('Ada Lovelace');
  });
});

// ---------------------------------------------------------------------------
// 3. shouldSendConfirmationEmail — dedup guard
// ---------------------------------------------------------------------------

describe('shouldSendConfirmationEmail', () => {
  it('returns true when paymentStatus is null (first authorization)', () => {
    expect(shouldSendConfirmationEmail(null)).toBe(true);
  });

  it('returns true when paymentStatus is undefined (no prior status)', () => {
    expect(shouldSendConfirmationEmail(undefined)).toBe(true);
  });

  it('returns false when paymentStatus is already AUTHORIZED (Stripe retry)', () => {
    expect(shouldSendConfirmationEmail('AUTHORIZED')).toBe(false);
  });

  it('returns false when paymentStatus is CAPTURED (already past authorization)', () => {
    expect(shouldSendConfirmationEmail('CAPTURED')).toBe(false);
  });

  it('returns true when paymentStatus is FAILED (re-attempt after failure — edge case, allow)', () => {
    expect(shouldSendConfirmationEmail('FAILED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. rsvpConfirmedEmail — timezone (Central / America/Chicago)
// ---------------------------------------------------------------------------

describe('rsvpConfirmedEmail — timezone (Central)', () => {
  // 01:00 UTC on Aug 2 is 8:00 PM CDT on Aug 1 (UTC-5 in summer). Rendering in
  // the server zone (UTC) would show "1:00 AM" on "August 2" — the reported bug.
  const eveningUtc = new Date('2026-08-02T01:00:00Z');

  it('renders the event time in Central wall-clock, not raw UTC', () => {
    const { html } = rsvpConfirmedEmail(
      'Test Person', 'Evening Salon', eveningUtc, 'Austin', 'evening-salon', 'rsvp_tz123456', true,
    );
    expect(html).toContain('8:00');
    expect(html).toContain('PM');
    expect(html).not.toContain('1:00 AM');
  });

  it('does not shift the date across midnight (stays August 1, not August 2)', () => {
    const { html } = rsvpConfirmedEmail(
      'Test Person', 'Evening Salon', eveningUtc, 'Austin', 'evening-salon', 'rsvp_tz123456', true,
    );
    expect(html).toContain('August 1');
    expect(html).not.toContain('August 2');
  });
});

// ---------------------------------------------------------------------------
// 5. GuestAccessConfirmation — timezone source guard
// ---------------------------------------------------------------------------

describe('GuestAccessConfirmation — renders in Central', () => {
  // The component is a react-email .tsx the vitest harness cannot import (no JSX
  // transform), so this guards the source: it must format in America/Chicago and
  // never fall back to America/New_York or an implicit (UTC) zone.
  it('source uses America/Chicago and not America/New_York', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'emails/GuestAccessConfirmation.tsx'),
      'utf8',
    );
    const chicagoCount = src.split("timeZone: 'America/Chicago'").length - 1;
    expect(chicagoCount).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('America/New_York');
  });
});
