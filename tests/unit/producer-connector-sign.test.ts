import { describe, it, expect } from 'vitest';
import { canonicalizeQuery, signProducerGet } from '@/lib/connectors/producer/sign';

describe('canonicalizeQuery', () => {
  it('sorts params by key and drops undefined/empty values', () => {
    expect(
      canonicalizeQuery({ updatedSince: '2026-06-11', limit: '2', cursor: undefined }),
    ).toBe('limit=2&updatedSince=2026-06-11');
    expect(canonicalizeQuery({ cursor: '', limit: '50' })).toBe('limit=50');
    expect(canonicalizeQuery({})).toBe('');
  });

  it('percent-encodes the colons in ISO timestamps (the canonicalization trap)', () => {
    expect(canonicalizeQuery({ updatedSince: '2026-06-11T00:00:00.000Z' })).toBe(
      'updatedSince=2026-06-11T00%3A00%3A00.000Z',
    );
  });
});

describe('signProducerGet', () => {
  const base = {
    secret: 'test-secret',
    pathname: '/api/crm-export/vendors',
    unixSeconds: 1_700_000_000,
  };

  it('matches the fixed vector for a timestamped query (independently computed)', () => {
    const query = canonicalizeQuery({ limit: '2', updatedSince: '2026-06-11T00:00:00.000Z' });
    const headers = signProducerGet({ ...base, query });
    expect(headers['X-NoBC-Timestamp']).toBe('1700000000');
    expect(headers['X-NoBC-Signature']).toBe(
      'hmac-sha256=7db49a5d165efd4148bdda26e69f3a6524844e32dc7c9dd93c10e76ad7f63def',
    );
  });

  it('matches the fixed vector for an empty query', () => {
    const headers = signProducerGet({ ...base, query: '' });
    expect(headers['X-NoBC-Signature']).toBe(
      'hmac-sha256=702331b655074a963afa01cd6e8d4c14eadad485b84bd89c323281d09ad0f71c',
    );
  });

  it('changes the signature when any signed input changes', () => {
    const a = signProducerGet({ ...base, query: 'limit=2' })['X-NoBC-Signature'];
    const b = signProducerGet({ ...base, query: 'limit=3' })['X-NoBC-Signature'];
    const c = signProducerGet({ ...base, unixSeconds: base.unixSeconds + 1, query: 'limit=2' })[
      'X-NoBC-Signature'
    ];
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
