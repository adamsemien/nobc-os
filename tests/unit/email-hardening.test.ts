/**
 * Transactional email hardening guards.
 *
 * Locks in the invariants from the 2026-06-16 email sweep:
 *   1. No data: image URIs in any email (Gmail/Outlook reject them — the bug
 *      class fixed by serving QR codes as hosted PNGs at /api/qr/[rsvpId]).
 *   2. QR images reference the hosted https /api/qr endpoint.
 *   3. The app-URL fallback is app.thenobadcompany.com (which serves /api/qr
 *      and /m), never the bare marketing host thenobadcompany.com.
 *
 * String templates (lib/email-templates.ts) are exercised behaviorally.
 * The emails/*.tsx react-email components cannot be imported by the vitest
 * harness (no JSX transform configured), so they are guarded by source-scan.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rsvpConfirmedEmail, compTicketEmail } from '@/lib/email-templates';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const ALL_TSX = [
  'emails/WelcomeEmail.tsx',
  'emails/WaitlistEmail.tsx',
  'emails/DeclineEmail.tsx',
  'emails/GuestAccessConfirmation.tsx',
];

// Files whose appUrl fallback must be the app domain (they emit /api/qr or /m links).
const FILES_WITH_APP_URL = [
  'lib/email-templates.ts',
  'emails/WelcomeEmail.tsx',
  'emails/GuestAccessConfirmation.tsx',
];

const startAt = new Date('2026-08-02T01:00:00Z');

describe('no data: image URIs in any email', () => {
  it('rsvpConfirmedEmail (with QR)', () => {
    const { html } = rsvpConfirmedEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'test-event', 'rsvp_abc12345', true,
    );
    expect(html).not.toContain('data:image');
  });

  it('compTicketEmail', () => {
    const { html } = compTicketEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'rsvp_abc12345',
    );
    expect(html).not.toContain('data:image');
  });

  for (const f of ALL_TSX) {
    it(`${f} source has no data:image URI`, () => {
      expect(src(f)).not.toContain('data:image');
    });
  }
});

describe('QR images use the hosted https /api/qr endpoint', () => {
  it('rsvpConfirmedEmail QR img is a hosted https /api/qr URL', () => {
    const { html } = rsvpConfirmedEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'test-event', 'rsvp_abc12345', true,
    );
    expect(html).toMatch(/<img src="https:\/\/[^"]*\/api\/qr\/rsvp_abc12345"/);
  });

  it('compTicketEmail QR img is a hosted https /api/qr URL', () => {
    const { html } = compTicketEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'rsvp_abc12345',
    );
    expect(html).toMatch(/<img src="https:\/\/[^"]*\/api\/qr\/rsvp_abc12345"/);
  });

  it('GuestAccessConfirmation source references the hosted /api/qr endpoint', () => {
    expect(src('emails/GuestAccessConfirmation.tsx')).toContain('/api/qr/');
  });
});

describe('app-URL fallback targets app.thenobadcompany.com, not the marketing host', () => {
  for (const f of FILES_WITH_APP_URL) {
    it(`${f} uses the app. fallback`, () => {
      const s = src(f);
      expect(s).toContain("?? 'https://app.thenobadcompany.com'");
      // The bare marketing host has no /api/qr or /m routes.
      expect(s).not.toContain("?? 'https://thenobadcompany.com'");
    });
  }
});

describe('user-supplied text is HTML-escaped (no injection into email markup)', () => {
  const evil = '<script>alert(1)</script><img src=x onerror=alert(1)>';

  it('rsvpConfirmedEmail escapes a malicious name and event title', () => {
    const { html } = rsvpConfirmedEmail(
      evil, evil, startAt, evil, 'test-event', 'rsvp_abc12345', true,
    );
    // The injected tags must be inert text, not live markup.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('compTicketEmail escapes a malicious name, title, and location', () => {
    const { html } = compTicketEmail(evil, evil, startAt, evil, 'rsvp_abc12345');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps the QR <img> tag intact while escaping the surrounding text', () => {
    // The escape must not clobber the template's own markup — only the
    // interpolated values.
    const { html } = rsvpConfirmedEmail(
      evil, 'Normal Title', startAt, 'The Venue', 'test-event', 'rsvp_abc12345', true,
    );
    expect(html).toMatch(/<img src="https:\/\/[^"]*\/api\/qr\/rsvp_abc12345"/);
  });
});

describe('plus-one guest email includes the event time in Central', () => {
  it('renders a Central-time clock, not just the date', () => {
    const s = src('app/api/rsvp/plus-one/route.ts');
    // A date uses toLocaleDateString; showing a clock time requires
    // toLocaleTimeString, and it must be pinned to Central like the date.
    expect(s).toContain('toLocaleTimeString');
    expect(s).toContain("timeZone: 'America/Chicago'");
  });
});
