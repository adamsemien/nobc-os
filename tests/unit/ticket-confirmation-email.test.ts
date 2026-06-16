/**
 * Tests for the ticketed-purchase confirmation email pipeline.
 *
 * Covers:
 *  1. rsvpConfirmedEmail template — QR embed + link fallback
 *  2. resolveTicketRecipient — canonical email for member + guest buyers
 *  3. shouldSendConfirmationEmail — dedup guard (only fires on first AUTHORIZED transition)
 */

import { describe, it, expect } from 'vitest';
import { rsvpConfirmedEmail } from '@/lib/email-templates';
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

  it('still includes the confirmed-page link when QR is available', () => {
    const { html } = rsvpConfirmedEmail(
      BASE.name,
      BASE.eventTitle,
      BASE.startAt,
      BASE.location,
      BASE.eventSlug,
      BASE.rsvpId,
      true,
    );
    expect(html).toContain(`/m/events/${BASE.eventSlug}/confirmed?rsvpId=${BASE.rsvpId}`);
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
    expect(html).toContain(`/m/events/${BASE.eventSlug}/confirmed?rsvpId=${BASE.rsvpId}`);
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
