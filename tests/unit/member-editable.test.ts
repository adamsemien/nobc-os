import { describe, it, expect } from 'vitest';
import {
  classifyFieldKey,
  isReservedKey,
  isEditableColumn,
  isReadOnlyMemberKey,
  slugifyFieldKey,
  EDITABLE_MEMBER_COLUMNS,
  RESERVED_FIELD_KEYS,
} from '@/lib/member-editable';

describe('member-editable — field key classification (F4/F5 policy)', () => {
  it('classifies first-class editable Profile columns as "column"', () => {
    for (const key of EDITABLE_MEMBER_COLUMNS) {
      expect(classifyFieldKey(key)).toBe('column');
      expect(isEditableColumn(key)).toBe(true);
    }
  });

  it('classifies an operator-defined key as "custom"', () => {
    expect(classifyFieldKey('dietary_preference')).toBe('custom');
    expect(classifyFieldKey('producerTier')).toBe('custom');
  });

  it('classifies email and computed/system columns as "readonly"', () => {
    for (const key of ['email', 'totalEventsAttended', 'energyScore', 'status', 'createdAt']) {
      expect(classifyFieldKey(key)).toBe('readonly');
      expect(isReadOnlyMemberKey(key)).toBe(true);
    }
  });

  it('slugifies labels into safe stable keys', () => {
    expect(slugifyFieldKey('Dietary Preference')).toBe('dietary_preference');
    expect(slugifyFieldKey('  Spicy?!  ')).toBe('spicy');
    expect(slugifyFieldKey('')).toBe('field');
  });
});

// Explicit firewall coverage: reserved/psychographic keys must classify as reserved and be
// rejected as edit targets and as custom-field names. Pairs with the route-level rejection
// tests (member-patch-route, member-fields-route).
describe('member-editable — reserved-key firewall', () => {
  it('treats archetype + archetypeScores (and the psychographic set) as reserved', () => {
    expect(isReservedKey('archetype')).toBe(true);
    expect(isReservedKey('archetypeScores')).toBe(true);
    for (const key of RESERVED_FIELD_KEYS) {
      expect(classifyFieldKey(key)).toBe('reserved');
    }
  });

  it('catches a reserved label at the slug level, and leaves normal labels alone', () => {
    // A custom-field name that slugifies to a reserved key is blocked (the F5 guard).
    expect(isReservedKey(slugifyFieldKey('Archetype'))).toBe(true);
    expect(isReservedKey(slugifyFieldKey('archetype'))).toBe(true);
    // A normal field name is allowed.
    expect(isReservedKey(slugifyFieldKey('Dietary Preference'))).toBe(false);
    expect(isReservedKey(slugifyFieldKey('Producer Tier'))).toBe(false);
  });

  it('a reserved key is never an editable column', () => {
    expect(isEditableColumn('archetype')).toBe(false);
    expect(classifyFieldKey('archetype')).not.toBe('column');
  });
});
