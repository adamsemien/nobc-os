import { describe, it, expect } from 'vitest';
import {
  applyFieldWrites,
  patchMemberSchema,
  PROVENANCE_SOURCES,
} from '@/lib/member-provenance';

describe('applyFieldWrites — provenance stamping', () => {
  it('writes value into customFields and stamps a provenance record', () => {
    const out = applyFieldWrites({
      customFields: null,
      fieldProvenance: null,
      writes: { industry: { value: 'Fashion', source: 'operator_entered' } },
      syncedAt: '2026-06-06T00:00:00.000Z',
    });
    expect(out.customFields).toEqual({ industry: 'Fashion' });
    expect(out.fieldProvenance).toEqual({
      industry: { value: 'Fashion', source: 'operator_entered', syncedAt: '2026-06-06T00:00:00.000Z' },
    });
  });

  it('preserves unwritten keys in both blobs (additive merge)', () => {
    const out = applyFieldWrites({
      customFields: { city: 'NYC', industry: 'Tech' },
      fieldProvenance: {
        city: { value: 'NYC', source: 'self_reported', syncedAt: 't0' },
        industry: { value: 'Tech', source: 'self_reported', syncedAt: 't0' },
      },
      writes: { industry: { value: 'Fashion', source: 'operator_entered' } },
      syncedAt: 't1',
    });
    // city untouched; industry overwritten + re-stamped.
    expect(out.customFields).toEqual({ city: 'NYC', industry: 'Fashion' });
    expect(out.fieldProvenance.city).toEqual({ value: 'NYC', source: 'self_reported', syncedAt: 't0' });
    expect(out.fieldProvenance.industry).toEqual({ value: 'Fashion', source: 'operator_entered', syncedAt: 't1' });
  });

  it('includes confidence only when provided', () => {
    const out = applyFieldWrites({
      customFields: null,
      fieldProvenance: null,
      writes: {
        a: { value: 'x', source: 'ai_inferred', confidence: 0.4 },
        b: { value: 'y', source: 'operator_entered' },
      },
      syncedAt: 't',
    });
    expect(out.fieldProvenance.a).toMatchObject({ confidence: 0.4 });
    expect(out.fieldProvenance.b).not.toHaveProperty('confidence');
  });

  it('does not mutate the input blobs', () => {
    const customFields = { city: 'NYC' };
    const fieldProvenance = { city: { value: 'NYC', source: 'self_reported' as const, syncedAt: 't0' } };
    applyFieldWrites({
      customFields,
      fieldProvenance,
      writes: { city: { value: 'LA', source: 'operator_entered' } },
      syncedAt: 't1',
    });
    expect(customFields).toEqual({ city: 'NYC' });
    expect(fieldProvenance.city.value).toBe('NYC');
  });
});

describe('patchMemberSchema — request validation', () => {
  it('defaults source to operator_entered', () => {
    const parsed = patchMemberSchema.parse({ fields: { industry: { value: 'Fashion' } } });
    expect(parsed.fields.industry.source).toBe('operator_entered');
  });

  it('rejects an empty fields object', () => {
    expect(patchMemberSchema.safeParse({ fields: {} }).success).toBe(false);
  });

  it('rejects an unknown provenance source', () => {
    const r = patchMemberSchema.safeParse({ fields: { x: { value: 'v', source: 'guessed' } } });
    expect(r.success).toBe(false);
  });

  it('rejects a confidence outside [0,1]', () => {
    const r = patchMemberSchema.safeParse({ fields: { x: { value: 'v', confidence: 2 } } });
    expect(r.success).toBe(false);
  });

  it('rejects a nested-object value (keeps JSONB queryable)', () => {
    const r = patchMemberSchema.safeParse({ fields: { x: { value: { nested: true } } } });
    expect(r.success).toBe(false);
  });

  it('accepts scalar + string-array values', () => {
    expect(patchMemberSchema.safeParse({ fields: { a: { value: 'text' } } }).success).toBe(true);
    expect(patchMemberSchema.safeParse({ fields: { a: { value: 42 } } }).success).toBe(true);
    expect(patchMemberSchema.safeParse({ fields: { a: { value: true } } }).success).toBe(true);
    expect(patchMemberSchema.safeParse({ fields: { a: { value: null } } }).success).toBe(true);
    expect(patchMemberSchema.safeParse({ fields: { a: { value: ['x', 'y'] } } }).success).toBe(true);
  });

  it('exposes the full provenance source union including producer', () => {
    expect(PROVENANCE_SOURCES).toEqual([
      'self_reported',
      'operator_entered',
      'ai_inferred',
      'verified_enrichment',
      'producer',
    ]);
  });
});
