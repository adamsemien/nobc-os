import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mintOptInToken, verifyOptInToken, OPTIN_TOKEN_TTL_MS } from '@/lib/opt-in/token';
import { toE164 } from '@/lib/opt-in/phone';
import { classifyBinding } from '@/lib/opt-in/record';
import { buildDisclosureText, DISCLOSURE_VERSION } from '@/lib/opt-in/disclosure';
import { timezoneForZip, isKnownZip } from '@/lib/opt-in/zip-timezone';

const SCOPE = { workspaceId: 'ws_1', personId: 'per_1' };

describe('opt-in token', () => {
  const prev = process.env.OPTIN_TOKEN_SECRET;
  beforeEach(() => {
    process.env.OPTIN_TOKEN_SECRET = 'test-secret';
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.OPTIN_TOKEN_SECRET;
    else process.env.OPTIN_TOKEN_SECRET = prev;
  });

  it('round-trips a valid token', () => {
    const token = mintOptInToken(SCOPE);
    expect(token).toBeTruthy();
    expect(verifyOptInToken(token)).toEqual(SCOPE);
  });

  it('mints null when the secret is unset (fail closed)', () => {
    delete process.env.OPTIN_TOKEN_SECRET;
    expect(mintOptInToken(SCOPE)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mintOptInToken(SCOPE)!;
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...SCOPE, personId: 'per_EVIL', purpose: 'sms_optin', exp: Date.now() + 1000 }),
    ).toString('base64url');
    expect(verifyOptInToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyOptInToken(`${payload}.AAAA${sig.slice(4)}`)).toBeNull();
  });

  it('rejects an expired token and garbage', () => {
    const past = new Date(Date.now() - OPTIN_TOKEN_TTL_MS - 1000);
    const expired = mintOptInToken(SCOPE, past)!;
    expect(verifyOptInToken(expired)).toBeNull();
    expect(verifyOptInToken('not-a-token')).toBeNull();
    expect(verifyOptInToken('')).toBeNull();
    expect(verifyOptInToken(null)).toBeNull();
  });

  it('rejects a token minted for a different purpose shape', () => {
    // Hand-build a payload with the wrong purpose, signed correctly.
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const payload = Buffer.from(
      JSON.stringify({ ...SCOPE, purpose: 'checkin', exp: Date.now() + 1000 }),
    ).toString('base64url');
    const sig = createHmac('sha256', 'test-secret').update(payload).digest('base64url');
    expect(verifyOptInToken(`${payload}.${sig}`)).toBeNull();
  });

  it('TTL is 365 days', () => {
    expect(OPTIN_TOKEN_TTL_MS).toBe(365 * 24 * 60 * 60 * 1000);
  });
});

describe('toE164 (libphonenumber-js, US default)', () => {
  it('normalizes common US formats to one E.164', () => {
    expect(toE164('(512) 555-0123')).toBe('+15125550123');
    expect(toE164('512-555-0123')).toBe('+15125550123');
    expect(toE164('5125550123')).toBe('+15125550123');
    expect(toE164('1 512 555 0123')).toBe('+15125550123');
    expect(toE164('+15125550123')).toBe('+15125550123');
  });

  it('rejects invalid numbers', () => {
    expect(toE164('123')).toBeNull();
    expect(toE164('555-0123')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe('classifyBinding', () => {
  it('cold is always COLD', () => {
    expect(classifyBinding('cold', '+15125550123', '+15125550123')).toBe('COLD');
    expect(classifyBinding('cold', null, '+15125550123')).toBe('COLD');
  });

  it('token + matching stored phone (any legacy format) is TOKEN_PHONE_MATCH', () => {
    expect(classifyBinding('token', '+15125550123', '+15125550123')).toBe('TOKEN_PHONE_MATCH');
    expect(classifyBinding('token', '(512) 555-0123', '+15125550123')).toBe('TOKEN_PHONE_MATCH');
    expect(classifyBinding('token', '5125550123', '+15125550123')).toBe('TOKEN_PHONE_MATCH');
  });

  it('token + no/different stored phone is TOKEN_PHONE_NEW', () => {
    expect(classifyBinding('token', null, '+15125550123')).toBe('TOKEN_PHONE_NEW');
    expect(classifyBinding('token', '+15125559999', '+15125550123')).toBe('TOKEN_PHONE_NEW');
  });
});

describe('disclosure block', () => {
  it('carries every mandated element', () => {
    const text = buildDisclosureText('(844) 555-0100');
    expect(text).toContain('No Bad Company');
    expect(text).toContain('recurring marketing and event text messages');
    expect(text).toContain('Message frequency varies');
    expect(text).toContain('Msg & data rates may apply');
    expect(text).toContain('Reply STOP to cancel, HELP for help');
    expect(text).toContain('/terms');
    expect(text).toContain('/privacy');
    expect(text).toContain('(844) 555-0100');
    expect(text).toContain('not a condition of any purchase or membership');
  });

  it('is deterministic and versioned', () => {
    expect(buildDisclosureText('x')).toBe(buildDisclosureText('x'));
    expect(DISCLOSURE_VERSION).toBe('v1');
  });
});

describe('zip -> IANA timezone (zip-level, vendored)', () => {
  it('El Paso is Mountain — the case that disqualifies a state-level map', () => {
    expect(timezoneForZip('79901')).toBe('America/Denver');
  });
  it('Austin is Central, Honolulu is Pacific/Honolulu', () => {
    expect(timezoneForZip('78701')).toBe('America/Chicago');
    expect(timezoneForZip('96813')).toBe('Pacific/Honolulu');
  });
  it('handles zip+4 and rejects unknowns', () => {
    expect(timezoneForZip('78701-1234')).toBe('America/Chicago');
    expect(timezoneForZip('00000')).toBeNull();
    expect(timezoneForZip('abc')).toBeNull();
    expect(isKnownZip('79901')).toBe(true);
    expect(isKnownZip('00000')).toBe(false);
  });
});
