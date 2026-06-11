import { describe, it, expect } from 'vitest';
import { vendorToNormalizedContact } from '@/lib/connectors/producer/transform';
import type { ProducerVendor } from '@/lib/connectors/producer/types';

const fullVendor: ProducerVendor = {
  id: 'dc_123',
  workspaceId: 'producer_ws_abc',
  name: 'Acme Florals',
  roles: ['Vendor', 'Partner'],
  type: 'Florist',
  category: 'Decor',
  contactName: 'Jane Q Doe',
  contactEmail: 'Jane@Acme.com  ',
  contactPhone: ' 512-555-0100 ',
  website: 'https://acme.example',
  logoUrl: 'https://cdn.example/logo.png',
  insuranceVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

describe('vendorToNormalizedContact', () => {
  it('maps a full vendor with normalization and name split', () => {
    const c = vendorToNormalizedContact(fullVendor, fetchedAt);
    expect(c.source).toBe('producer');
    expect(c.externalId).toBe('dc_123');
    expect(c.email).toBe('jane@acme.com'); // lowercased + trimmed
    expect(c.emailRaw).toBe('Jane@Acme.com'); // trimmed, original casing
    expect(c.phone).toBe('512-555-0100');
    expect(c.firstName).toBe('Jane');
    expect(c.lastName).toBe('Q Doe');
    expect(c.roleHint).toBe('vendor');
    expect(c.tags).toEqual(['Vendor', 'Partner']);
    expect(c.avatarUrl).toBe('https://cdn.example/logo.png');
    expect(c.sourceFetchedAt).toBe(fetchedAt);
    expect(c.rawSnapshot).toBe(fullVendor);
  });

  it('keeps Producer workspaceId only in enrichment, never as our scope', () => {
    const c = vendorToNormalizedContact(fullVendor, fetchedAt);
    expect('workspaceId' in c).toBe(false);
    expect(c.enrichment).toMatchObject({
      companyName: 'Acme Florals',
      type: 'Florist',
      category: 'Decor',
      insuranceVerified: true,
      producerWorkspaceId: 'producer_ws_abc',
    });
  });

  it('handles missing optional fields', () => {
    const sparse: ProducerVendor = {
      ...fullVendor,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      logoUrl: null,
      roles: [],
    };
    const c = vendorToNormalizedContact(sparse, fetchedAt);
    expect(c.email).toBeUndefined();
    expect(c.emailRaw).toBeUndefined();
    expect(c.phone).toBeUndefined();
    expect(c.firstName).toBeUndefined();
    expect(c.lastName).toBeUndefined();
    expect(c.website).toBeUndefined();
    expect(c.avatarUrl).toBeUndefined();
    expect(c.tags).toBeUndefined();
  });

  it('treats a single-token contactName as a first name only', () => {
    const c = vendorToNormalizedContact({ ...fullVendor, contactName: 'Cher' }, fetchedAt);
    expect(c.firstName).toBe('Cher');
    expect(c.lastName).toBeUndefined();
  });
});
