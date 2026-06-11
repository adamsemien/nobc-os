import { describe, it, expect } from 'vitest';
import {
  canonicalEmail,
  canonicalPhone,
  canonicalInstagram,
  buildContactIndex,
  resolveContact,
  resolveBatch,
  type ContactIdentity,
} from '@/lib/connectors/ingest/identity';
import type { NormalizedContact } from '@/lib/connectors/types';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

/** Minimal NormalizedContact builder — only the identity keys matter here. */
function contact(partial: Partial<NormalizedContact>): NormalizedContact {
  return {
    source: 'csv',
    externalId: partial.externalId ?? 'x',
    rawSnapshot: null,
    sourceFetchedAt: fetchedAt,
    ...partial,
  };
}

describe('canonicalization (mirrors member-merge)', () => {
  it('lowercases + trims email', () => {
    expect(canonicalEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(canonicalEmail('   ')).toBeUndefined();
    expect(canonicalEmail(null)).toBeUndefined();
  });

  it('strips phone separators and a leading country 1 to 10 national digits', () => {
    expect(canonicalPhone('+1 (512) 555-0143')).toBe('5125550143');
    expect(canonicalPhone('512.555.0143')).toBe('5125550143');
    expect(canonicalPhone('15125550143')).toBe('5125550143');
    expect(canonicalPhone('5125550143')).toBe('5125550143');
    expect(canonicalPhone(undefined)).toBeUndefined();
  });

  it('strips @, url wrapper, trailing slash/query from instagram', () => {
    expect(canonicalInstagram('@DevinHsu')).toBe('devinhsu');
    expect(canonicalInstagram('https://www.instagram.com/DevinHsu/')).toBe('devinhsu');
    expect(canonicalInstagram('https://instagram.com/devinhsu?hl=en')).toBe('devinhsu');
  });
});

const EXISTING: ContactIdentity[] = [
  { contactId: 'c_amy', email: 'amy@nobc.com', phone: '+1 512-555-0001', instagram: '@amy' },
  { contactId: 'c_ben', email: 'ben@nobc.com', phone: '5125550002' },
  { contactId: 'c_cara', instagram: 'caraonly' }, // ig-only, no email/phone
];

describe('resolveContact', () => {
  const index = buildContactIndex(EXISTING);

  it('MATCHes on exact email (case/space-insensitive)', () => {
    const d = resolveContact(contact({ email: '  AMY@nobc.com ' }), index);
    expect(d).toEqual({ kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' });
  });

  it('REVIEWs a phone-only match (soft, never auto)', () => {
    const d = resolveContact(contact({ phone: '(512) 555-0002' }), index);
    expect(d.kind).toBe('review');
    if (d.kind === 'review') {
      expect(d.reason).toBe('soft_match');
      expect(d.candidates).toEqual([{ contactId: 'c_ben', key: 'phone' }]);
    }
  });

  it('REVIEWs an instagram-only match (soft)', () => {
    const d = resolveContact(contact({ instagram: 'caraonly' }), index);
    expect(d.kind).toBe('review');
    if (d.kind === 'review') expect(d.candidates).toEqual([{ contactId: 'c_cara', key: 'instagram' }]);
  });

  it('flags CONFLICTING identity when email and phone point to different contacts', () => {
    // email → amy, phone → ben
    const d = resolveContact(contact({ email: 'amy@nobc.com', phone: '5125550002' }), index);
    expect(d.kind).toBe('review');
    if (d.kind === 'review') {
      expect(d.reason).toBe('conflicting_identity');
      expect(d.candidates).toContainEqual({ contactId: 'c_amy', key: 'email_exact' });
      expect(d.candidates).toContainEqual({ contactId: 'c_ben', key: 'phone' });
    }
  });

  it('MATCHes (not review) when email + a soft key corroborate the SAME contact', () => {
    const d = resolveContact(contact({ email: 'amy@nobc.com', phone: '512-555-0001' }), index);
    expect(d).toEqual({ kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' });
  });

  it('flags AMBIGUOUS when a soft key matches several contacts', () => {
    const shared = buildContactIndex([
      { contactId: 'c_1', phone: '5125559999' },
      { contactId: 'c_2', phone: '512-555-9999' },
    ]);
    const d = resolveContact(contact({ phone: '5125559999' }), shared);
    expect(d.kind).toBe('review');
    if (d.kind === 'review') {
      expect(d.reason).toBe('ambiguous');
      expect(d.candidates).toHaveLength(2);
    }
  });

  it('CREATEs when nothing matches, counting identity keys', () => {
    const d = resolveContact(contact({ email: 'new@nobc.com', phone: '5125550009' }), index);
    expect(d).toEqual({ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 2 });
  });

  it('CREATEs the identity-less "met in the wild" capture with identityKeyCount 0', () => {
    const d = resolveContact(contact({ firstName: 'Wild', lastName: 'Card' }), index);
    expect(d).toEqual({ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 0 });
  });

  it('collapses a contact matched on two soft keys into one candidate (strongest key)', () => {
    const both = buildContactIndex([{ contactId: 'c_x', phone: '5125551111', instagram: 'xhandle' }]);
    const d = resolveContact(contact({ phone: '5125551111', instagram: 'xhandle' }), both);
    expect(d.kind).toBe('review');
    if (d.kind === 'review') expect(d.candidates).toEqual([{ contactId: 'c_x', key: 'phone' }]);
  });
});

describe('resolveBatch — intra-batch dedup', () => {
  const index = buildContactIndex(EXISTING);

  it('collapses two incoming rows for the same NEW email (2nd matches the 1st provisional)', () => {
    const batch = [
      contact({ externalId: 'r1', email: 'zoe@nobc.com', firstName: 'Zoe' }),
      contact({ externalId: 'r2', email: 'ZOE@nobc.com', firstName: 'Zoe Again' }),
    ];
    const [d1, d2] = resolveBatch(batch, index);
    expect(d1).toEqual({ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 });
    expect(d2).toEqual({ kind: 'match', contactId: 'provisional:0', matchedOn: 'email_exact' });
  });

  it('soft-matches a later row against an earlier provisional create (phone)', () => {
    const batch = [
      contact({ externalId: 'r1', phone: '5125557777', firstName: 'New' }),
      contact({ externalId: 'r2', phone: '512-555-7777', firstName: 'Same line?' }),
    ];
    const [d1, d2] = resolveBatch(batch, index);
    expect(d1.kind).toBe('create');
    expect(d2.kind).toBe('review');
    if (d2.kind === 'review') {
      expect(d2.reason).toBe('soft_match');
      expect(d2.candidates).toEqual([{ contactId: 'provisional:0', key: 'phone' }]);
    }
  });

  it('does not mutate the caller-supplied index', () => {
    const before = index.byEmail.size;
    resolveBatch([contact({ email: 'brand@new.com' })], index);
    expect(index.byEmail.size).toBe(before);
  });

  it('still matches existing DB contacts inside a batch', () => {
    const [d] = resolveBatch([contact({ email: 'ben@nobc.com' })], index);
    expect(d).toEqual({ kind: 'match', contactId: 'c_ben', matchedOn: 'email_exact' });
  });
});
