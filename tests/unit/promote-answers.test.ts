import { describe, it, expect, vi } from 'vitest';

/**
 * Apply scalar promotion — lib/apply/promote-answers.ts (pure layer).
 *
 * scalarsFromAnswers is THE answer→scalar mapping shared by the apply write
 * path (create/PATCH routes), submit, and approve. Pins:
 *   - promote-on-parse-only: a partial/unparseable cell returns NO phone key,
 *     so an autosaved keystroke burst can never clobber a good E.164 scalar;
 *   - `cell` normalizes through toE164 (libphonenumber-js, US default) —
 *     the prod format drift (512-599-1979 vs 5125991979) converges to +1…;
 *   - home city comes from `homeAddress.city` ONLY — the top-level `cities`
 *     question ("other cities you spend real time in") must never map;
 *   - ZIP is 5-digit-validated and returned separately (no Application column).
 */

// promote-answers side-imports lib/db (for the effectful half); the pure
// functions under test never touch it. Stub so import doesn't construct a
// PrismaClient against a missing DATABASE_URL.
vi.mock('@/lib/db', () => ({ db: {} }));

import { scalarsFromAnswers, zipFromAnswers } from '@/lib/apply/promote-answers';

describe('scalarsFromAnswers — phone', () => {
  it('promotes a valid US cell to E.164, dashes and all', () => {
    expect(scalarsFromAnswers({ cell: '512-599-1979' })).toEqual({ phone: '+15125991979' });
    expect(scalarsFromAnswers({ cell: '5125991979' })).toEqual({ phone: '+15125991979' });
    expect(scalarsFromAnswers({ cell: '(512) 599-1979' })).toEqual({ phone: '+15125991979' });
    expect(scalarsFromAnswers({ cell: '+1 512 599 1979' })).toEqual({ phone: '+15125991979' });
  });

  it('returns {} for a partial cell mid-typing — must not clobber', () => {
    expect(scalarsFromAnswers({ cell: '512' })).toEqual({});
    expect(scalarsFromAnswers({ cell: '512-599' })).toEqual({});
  });

  it('returns {} for an unparseable cell', () => {
    expect(scalarsFromAnswers({ cell: 'call me maybe' })).toEqual({});
    expect(scalarsFromAnswers({ cell: '0000000000' })).toEqual({});
    expect(scalarsFromAnswers({ cell: '' })).toEqual({});
  });

  it('never emits an explicit undefined/null phone key on failure', () => {
    // Object.assign / prisma-data spread safety: a present-but-undefined key
    // would overwrite a previously promoted scalar.
    expect('phone' in scalarsFromAnswers({ cell: '512' })).toBe(false);
    expect('phone' in scalarsFromAnswers({})).toBe(false);
  });
});

describe('scalarsFromAnswers — city', () => {
  it('promotes homeAddress.city, trimmed', () => {
    expect(scalarsFromAnswers({ 'homeAddress.city': '  Austin ' })).toEqual({ city: 'Austin' });
  });

  it('does NOT map the top-level `cities` question to city', () => {
    expect(scalarsFromAnswers({ cities: 'NYC, Marfa, CDMX' })).toEqual({});
  });

  it('ignores an empty/whitespace city', () => {
    expect(scalarsFromAnswers({ 'homeAddress.city': '   ' })).toEqual({});
  });
});

describe('scalarsFromAnswers — general shape', () => {
  it('returns {} for an empty answers map', () => {
    expect(scalarsFromAnswers({})).toEqual({});
  });

  it('promotes phone and city together and ignores everything else', () => {
    expect(
      scalarsFromAnswers({
        cell: '5125991979',
        'homeAddress.city': 'Austin',
        'homeAddress.zip': '78701',
        cities: 'NYC',
        firstName: 'Ada',
        consentSms: 'true',
      }),
    ).toEqual({ phone: '+15125991979', city: 'Austin' });
  });

  it('tolerates non-string answer values (answersMap allows boolean/number/null)', () => {
    expect(scalarsFromAnswers({ cell: 5125991979 })).toEqual({ phone: '+15125991979' });
    expect(scalarsFromAnswers({ cell: null, 'homeAddress.city': null })).toEqual({});
    expect(scalarsFromAnswers({ cell: true })).toEqual({});
  });
});

describe('zipFromAnswers', () => {
  it('returns the 5-digit ZIP for a valid answer', () => {
    expect(zipFromAnswers({ 'homeAddress.zip': '78701' })).toBe('78701');
    expect(zipFromAnswers({ 'homeAddress.zip': ' 78701 ' })).toBe('78701');
  });

  it('reduces ZIP+4 to the 5-digit prefix', () => {
    expect(zipFromAnswers({ 'homeAddress.zip': '78701-1234' })).toBe('78701');
  });

  it('returns null for malformed ZIPs', () => {
    expect(zipFromAnswers({ 'homeAddress.zip': '787' })).toBeNull();
    expect(zipFromAnswers({ 'homeAddress.zip': '787011' })).toBeNull();
    expect(zipFromAnswers({ 'homeAddress.zip': 'ATX' })).toBeNull();
    expect(zipFromAnswers({ 'homeAddress.zip': '' })).toBeNull();
    expect(zipFromAnswers({})).toBeNull();
  });
});
