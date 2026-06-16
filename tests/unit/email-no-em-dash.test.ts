/**
 * Brand rule: no em dashes anywhere in transactional email copy.
 *
 * Two layers:
 *   1. Source-scan every email source file for U+2014 (—). This covers the
 *      react-email components in emails/*.tsx, which the vitest harness cannot
 *      import (no JSX transform configured — see note below), and is strict
 *      enough to catch em dashes in comments as well as rendered copy.
 *   2. Behavioral: call each string template in lib/email-templates.ts and
 *      assert the rendered subject + html contain no em dash.
 *
 * NOTE: render-based testing of the emails/*.tsx components would require a JSX
 * transform in the vitest config, which is intentionally not added here. The
 * source-scan below is the guardrail for those files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  rsvpConfirmedEmail,
  compTicketEmail,
  applicationApprovedEmail,
  applicationRejectedEmail,
  waitlistPromotedEmail,
  welcomeEmail,
} from '@/lib/email-templates';

const EM_DASH = '—';

const EMAIL_SOURCE_FILES = [
  'lib/email-templates.ts',
  'lib/email-templates-defaults.ts',
  'emails/WelcomeEmail.tsx',
  'emails/WaitlistEmail.tsx',
  'emails/DeclineEmail.tsx',
  'emails/GuestAccessConfirmation.tsx',
];

function readEmailSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('email source files contain no em dash', () => {
  for (const file of EMAIL_SOURCE_FILES) {
    it(file, () => {
      expect(readEmailSource(file)).not.toContain(EM_DASH);
    });
  }
});

const startAt = new Date('2026-08-02T01:00:00Z');

function expectNoEmDash(label: string, ...parts: string[]) {
  for (const part of parts) {
    expect(part, `${label} contains an em dash`).not.toContain(EM_DASH);
  }
}

describe('string email templates — no em dash in subject or body', () => {
  it('rsvpConfirmedEmail (with QR)', () => {
    const { subject, html } = rsvpConfirmedEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'test-event', 'rsvp_abc12345', true,
    );
    expectNoEmDash('rsvpConfirmedEmail', subject, html);
  });

  it('rsvpConfirmedEmail (link-only fallback)', () => {
    const { subject, html } = rsvpConfirmedEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'test-event', 'rsvp_abc12345',
    );
    expectNoEmDash('rsvpConfirmedEmail link-only', subject, html);
  });

  it('compTicketEmail', () => {
    const { subject, html } = compTicketEmail(
      'Test Person', 'Test Event', startAt, 'The Venue', 'rsvp_abc12345',
    );
    expectNoEmDash('compTicketEmail', subject, html);
  });

  it('applicationApprovedEmail', () => {
    const { subject, html } = applicationApprovedEmail('Test Person');
    expectNoEmDash('applicationApprovedEmail', subject, html);
  });

  it('applicationRejectedEmail', () => {
    const { subject, html } = applicationRejectedEmail('Test Person');
    expectNoEmDash('applicationRejectedEmail', subject, html);
  });

  it('waitlistPromotedEmail', () => {
    const { subject, html } = waitlistPromotedEmail('Test Person', 'Test Event', 'test-event');
    expectNoEmDash('waitlistPromotedEmail', subject, html);
  });

  it('welcomeEmail (with wallet pass section)', () => {
    const { subject, html } = welcomeEmail('Test Person', {
      appleWalletUrl: 'https://example.com/apple',
      googleWalletUrl: 'https://example.com/google',
    });
    expectNoEmDash('welcomeEmail', subject, html);
  });
});
