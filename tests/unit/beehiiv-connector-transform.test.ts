import { describe, it, expect } from 'vitest';
import { subscriptionToNormalizedContact } from '@/lib/connectors/beehiiv/transform';
import type { BeehiivSubscription } from '@/lib/connectors/beehiiv/types';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

function sub(p: Partial<BeehiivSubscription>): BeehiivSubscription {
  return { id: p.id ?? 'sub_1', email: p.email ?? 'a@b.com', status: p.status ?? 'active', ...p };
}

describe('subscriptionToNormalizedContact', () => {
  it('maps the core fields and always tags the role as subscriber', () => {
    const c = subscriptionToNormalizedContact(
      sub({ id: 'sub_42', email: '  Clark@DailyPlanet.com ', status: 'active' }),
      fetchedAt,
    );
    expect(c.source).toBe('beehiiv');
    expect(c.externalId).toBe('sub_42');
    expect(c.email).toBe('clark@dailyplanet.com');
    expect(c.emailRaw).toBe('Clark@DailyPlanet.com');
    expect(c.roleHint).toBe('subscriber');
    expect(c.sourceFetchedAt).toBe(fetchedAt);
    expect(c.enrichment).toMatchObject({ status: 'active' });
  });

  it('pulls first/last name from custom_fields (beehiiv has no native name field)', () => {
    const c = subscriptionToNormalizedContact(
      sub({
        custom_fields: [
          { name: 'First Name', value: 'Clark' },
          { name: 'Last Name', value: 'Kent' },
        ],
      }),
    );
    expect(c.firstName).toBe('Clark');
    expect(c.lastName).toBe('Kent');
  });

  it('splits a single "Name" custom field when no explicit first/last', () => {
    const c = subscriptionToNormalizedContact(sub({ custom_fields: [{ name: 'Name', value: 'Lois Lane' }] }));
    expect(c.firstName).toBe('Lois');
    expect(c.lastName).toBe('Lane');
  });

  it('extracts phone + Instagram identity keys from custom_fields (normalized)', () => {
    const c = subscriptionToNormalizedContact(
      sub({
        custom_fields: [
          { name: 'Phone', value: '+1 (512) 555-0143' },
          { name: 'Instagram', value: '@ClarkK' },
        ],
      }),
    );
    expect(c.phone).toBe('+1 (512) 555-0143'); // light normalize at adapter edge
    expect(c.instagram).toBe('clarkk');
  });

  it('passes through tags and omits empty ones', () => {
    expect(subscriptionToNormalizedContact(sub({ tags: ['Premium', 'Engaged'] })).tags).toEqual([
      'Premium',
      'Engaged',
    ]);
    expect(subscriptionToNormalizedContact(sub({ tags: [] })).tags).toBeUndefined();
  });

  it('handles a bare subscription (no custom_fields) without throwing', () => {
    const c = subscriptionToNormalizedContact(sub({ email: 'only@email.com' }));
    expect(c.email).toBe('only@email.com');
    expect(c.firstName).toBeUndefined();
    expect(c.phone).toBeUndefined();
    expect(c.instagram).toBeUndefined();
  });

  it('preserves the full record in rawSnapshot + enrichment provenance', () => {
    const s = sub({ subscription_tier: 'premium', utm_source: 'Twitter', referring_site: 'https://x.com', created: 1719939000 });
    const c = subscriptionToNormalizedContact(s);
    expect(c.rawSnapshot).toBe(s);
    expect(c.enrichment).toMatchObject({
      subscriptionTier: 'premium',
      utmSource: 'Twitter',
      referringSite: 'https://x.com',
      createdAt: 1719939000,
    });
  });
});
