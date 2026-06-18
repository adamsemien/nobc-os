import { describe, it, expect } from 'vitest';
import { isTwilioOptOut, SmsOptedOutError } from '@/lib/twilio';

// Twilio returns error code 21610 when sending to a number that has replied
// STOP. Classifying it correctly is what lets the reply route treat opt-out as
// an expected compliance outcome (409) instead of a system failure (502 + alert).

describe('isTwilioOptOut', () => {
  it('matches the real Twilio opt-out error code (numeric 21610)', () => {
    expect(isTwilioOptOut({ code: 21610, message: 'Attempt to send to unsubscribed recipient' })).toBe(true);
  });

  it('does not match other Twilio error codes', () => {
    expect(isTwilioOptOut({ code: 21211 })).toBe(false); // invalid 'To' number
    expect(isTwilioOptOut({ code: 30007 })).toBe(false); // carrier filtered
  });

  it('does not match the string "21610" (code must be numeric)', () => {
    expect(isTwilioOptOut({ code: '21610' })).toBe(false);
  });

  it('is null/undefined/primitive safe', () => {
    expect(isTwilioOptOut(null)).toBe(false);
    expect(isTwilioOptOut(undefined)).toBe(false);
    expect(isTwilioOptOut('21610')).toBe(false);
    expect(isTwilioOptOut(new Error('boom'))).toBe(false);
  });
});

describe('SmsOptedOutError', () => {
  it('is an Error subclass with a stable name for instanceof checks', () => {
    const e = new SmsOptedOutError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SmsOptedOutError');
  });
});
