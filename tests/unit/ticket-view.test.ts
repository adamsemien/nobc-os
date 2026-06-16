/**
 * Tests for the public, no-login ticket page (/ticket/[rsvpId]).
 *
 * Two layers, matching the repo's pattern for un-renderable components (the
 * vitest harness has no JSX transform, so app/ticket/[rsvpId]/page.tsx is a
 * React server component the suite cannot import - see email-no-em-dash.test.ts
 * and the GuestAccessConfirmation source guard in ticket-confirmation-email):
 *
 *   1. Behavioral: exercise lib/ticket-view.ts (a plain .ts module) with a
 *      mocked db, exactly like qr-route.test.ts. This locks the resolution,
 *      fail-closed, and "never expose the door credential" contracts.
 *   2. Source-scan: read the page .tsx as text and assert it wires the QR via
 *      the hosted /api/qr/[rsvpId] image, fails closed with notFound(), never
 *      references the raw credential, and carries no em dash or "RSVP" copy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/db', () => ({
  db: { rSVP: { findUnique: vi.fn() } },
}));

import { db } from '@/lib/db';
import {
  resolveTicketView,
  formatTicketDate,
  formatTicketTime,
  TICKET_ID_RE,
} from '@/lib/ticket-view';

const findUnique = db.rSVP.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

const VALID_ID = 'rsvp_abc12345';
const DOOR_CODE = 'nobc_door_credential_xyz';

function eventRow(over: Record<string, unknown> = {}) {
  return {
    event: {
      title: 'Summer Rooftop',
      startAt: new Date('2026-08-02T01:00:00Z'),
      location: 'Austin',
    },
    member: { firstName: 'Ada' },
    ...over,
  };
}

describe('resolveTicketView - resolution', () => {
  it('valid rsvpId resolves to event details + firstName', async () => {
    findUnique.mockResolvedValue(eventRow());
    const view = await resolveTicketView(VALID_ID);
    expect(view).not.toBeNull();
    expect(view).toMatchObject({
      rsvpId: VALID_ID,
      eventTitle: 'Summer Rooftop',
      location: 'Austin',
      firstName: 'Ada',
    });
    expect(view?.startAt).toBeInstanceOf(Date);
  });

  it('looks the RSVP up by id alone (capability token), no workspace pre-filter', async () => {
    findUnique.mockResolvedValue(eventRow());
    await resolveTicketView(VALID_ID);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0].where).toEqual({ id: VALID_ID });
  });
});

describe('resolveTicketView - never exposes the door credential', () => {
  it('the returned view carries no memberQrCode, even if the row had one', async () => {
    findUnique.mockResolvedValue(
      eventRow({ member: { firstName: 'Ada', memberQrCode: DOOR_CODE } }),
    );
    const view = await resolveTicketView(VALID_ID);
    expect(view).not.toHaveProperty('memberQrCode');
    expect(JSON.stringify(view)).not.toContain(DOOR_CODE);
  });

  it('does not request memberQrCode from the database', async () => {
    findUnique.mockResolvedValue(eventRow());
    await resolveTicketView(VALID_ID);
    const select = findUnique.mock.calls[0][0].select;
    expect(JSON.stringify(select)).not.toContain('memberQrCode');
    expect(select.member.select).toEqual({ firstName: true });
  });
});

describe('resolveTicketView - fail closed', () => {
  it('unknown id returns null', async () => {
    findUnique.mockResolvedValue(null);
    expect(await resolveTicketView(VALID_ID)).toBeNull();
  });

  it('an RSVP with no event returns null', async () => {
    findUnique.mockResolvedValue({ event: null, member: { firstName: 'Ada' } });
    expect(await resolveTicketView(VALID_ID)).toBeNull();
  });

  it('malformed id returns null and never touches the DB', async () => {
    expect(await resolveTicketView('bad id!')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('id shorter than the guard returns null without a DB call', async () => {
    expect(await resolveTicketView('short')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('a DB error fails closed to null, never throws', async () => {
    findUnique.mockRejectedValue(new Error('db down'));
    await expect(resolveTicketView(VALID_ID)).resolves.toBeNull();
  });
});

describe('TICKET_ID_RE matches the /api/qr guard shape', () => {
  it('accepts cuid-shaped ids, rejects junk and short ids', () => {
    expect(TICKET_ID_RE.test('rsvp_abc12345')).toBe(true);
    expect(TICKET_ID_RE.test('short')).toBe(false);
    expect(TICKET_ID_RE.test('bad id!')).toBe(false);
  });
});

describe('ticket date/time render in Central (America/Chicago)', () => {
  // 01:00 UTC Aug 2 is 8:00 PM CDT Aug 1. Rendering in the server zone (UTC)
  // would show 1:00 AM on Aug 2 - the same bug the email templates guard.
  const eveningUtc = new Date('2026-08-02T01:00:00Z');

  it('time is Central wall-clock, not raw UTC', () => {
    const t = formatTicketTime(eveningUtc);
    expect(t).toContain('8:00');
    expect(t).toContain('PM');
    expect(t).not.toContain('1:00');
  });

  it('date does not shift across midnight (stays August 1)', () => {
    const d = formatTicketDate(eveningUtc);
    expect(d).toContain('August 1');
    expect(d).not.toContain('August 2');
  });
});

describe('app/ticket/[rsvpId]/page.tsx source contract', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'app/ticket/[rsvpId]/page.tsx'),
    'utf8',
  );

  it('delivers the QR via the hosted /api/qr/[rsvpId] image', () => {
    expect(src).toContain('/api/qr/');
  });

  it('never references the raw door credential', () => {
    expect(src).not.toContain('memberQrCode');
  });

  it('fails closed with notFound() on an unresolved ticket', () => {
    expect(src).toContain('notFound()');
    expect(src).toContain('if (!ticket)');
  });

  it('carries no em dash', () => {
    expect(src).not.toContain('—');
  });

  it('uses no user-facing "RSVP" copy (the internal rsvpId var is fine)', () => {
    expect(src).not.toMatch(/\bRSVP\b/);
  });
});
