import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mintCheckInToken,
  verifyCheckInToken,
  bearerToken,
  checkInTokenExpiry,
  MAX_CHECKIN_VALID_HOURS,
  DEFAULT_CHECKIN_VALID_HOURS,
} from '@/lib/check-in-token';

// The check-in token is the door-scanner credential. The rejection cases ARE the
// security boundary, so they're the important assertions here.

const SCOPE = { workspaceId: 'ws_1', eventId: 'evt_1', slug: 'summer-gala' };
const HOUR = 60 * 60 * 1000;
const soon = () => new Date(Date.now() + 60_000);

describe('mint + verify', () => {
  beforeEach(() => { process.env.CHECKIN_SECRET = 'test-secret'; });
  afterEach(() => { process.env.CHECKIN_SECRET = 'test-secret'; });

  it('round-trips a valid token back to its scope', () => {
    const tok = mintCheckInToken(SCOPE, soon());
    expect(tok).toBeTruthy();
    expect(verifyCheckInToken(tok)).toEqual(SCOPE);
  });

  it('rejects a tampered payload (forged event id, original signature)', () => {
    const tok = mintCheckInToken(SCOPE, soon())!;
    const sig = tok.slice(tok.indexOf('.') + 1);
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...SCOPE, eventId: 'evt_HACK', exp: Date.now() + 60_000 }),
    ).toString('base64url');
    expect(verifyCheckInToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const tok = mintCheckInToken(SCOPE, new Date(Date.now() - 1000));
    expect(verifyCheckInToken(tok)).toBeNull();
  });

  it('rejects malformed / empty / null tokens', () => {
    expect(verifyCheckInToken('not-a-token')).toBeNull();
    expect(verifyCheckInToken('')).toBeNull();
    expect(verifyCheckInToken(null)).toBeNull();
    expect(verifyCheckInToken('a.b.c')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const tok = mintCheckInToken(SCOPE, soon())!;
    process.env.CHECKIN_SECRET = 'rotated-secret';
    expect(verifyCheckInToken(tok)).toBeNull();
  });

  it('fails closed when CHECKIN_SECRET is unset', () => {
    delete process.env.CHECKIN_SECRET;
    expect(mintCheckInToken(SCOPE, soon())).toBeNull();
    expect(verifyCheckInToken('anything')).toBeNull();
  });

  it('keeps each event scope distinct (route-level scope checks rely on this)', () => {
    const a = mintCheckInToken({ ...SCOPE, eventId: 'evt_A' }, soon())!;
    const b = mintCheckInToken({ ...SCOPE, eventId: 'evt_B' }, soon())!;
    expect(verifyCheckInToken(a)!.eventId).toBe('evt_A');
    expect(verifyCheckInToken(b)!.eventId).toBe('evt_B');
  });
});

describe('bearerToken', () => {
  it('extracts the token from an Authorization: Bearer header', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer abc')).toBe('abc');
  });
  it('returns null for missing or non-Bearer headers', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('abc')).toBeNull();
    expect(bearerToken('Basic xyz')).toBeNull();
  });
});

describe('checkInTokenExpiry', () => {
  const end = new Date('2026-06-10T02:00:00Z');
  const start = new Date('2026-06-09T20:00:00Z');

  it('uses event end + buffer hours', () => {
    expect(checkInTokenExpiry({ startAt: start, endAt: end }, 4).getTime()).toBe(end.getTime() + 4 * HOUR);
  });
  it('falls back to startAt + 24h when there is no end time', () => {
    expect(checkInTokenExpiry({ startAt: start, endAt: null }, 2).getTime()).toBe(start.getTime() + 24 * HOUR + 2 * HOUR);
  });
  it('clamps above the hard cap and floors at 1 hour', () => {
    expect(checkInTokenExpiry({ startAt: null, endAt: end }, 9999).getTime()).toBe(end.getTime() + MAX_CHECKIN_VALID_HOURS * HOUR);
    expect(checkInTokenExpiry({ startAt: null, endAt: end }, 0).getTime()).toBe(end.getTime() + 1 * HOUR);
  });
  it('uses the default buffer when validHours is not finite', () => {
    expect(checkInTokenExpiry({ startAt: null, endAt: end }, NaN).getTime()).toBe(end.getTime() + DEFAULT_CHECKIN_VALID_HOURS * HOUR);
  });
});
