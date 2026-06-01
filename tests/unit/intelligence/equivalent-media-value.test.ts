import { describe, expect, it } from 'vitest';
import { computeEquivalentMediaValue } from '@/lib/intelligence/equivalent-media-value';
import { archetypeToBucket, QUALIFIED_EXEC_TIERS } from '@/lib/intelligence/influence-tiers';

describe('computeEquivalentMediaValue', () => {
  // 24 attendees, 67% qualified exec mix, 500k impressions, $50k fee (the seeded demo case).
  const demo = computeEquivalentMediaValue({
    attendeeCount: 24,
    qualifiedMix: 0.67,
    totalReach: 500_000,
    rightsFeeCents: 5_000_000,
  });

  it('uses the per-lead method above the 60% qualified threshold', () => {
    expect(demo.downshifted).toBe(false);
    // 16 leads × $2,500 + 8 × $300 dinner floor = $42,400 audience
    expect(demo.headline.audienceValueCents).toBe(4_240_000);
    // 500k impressions × $62 LinkedIn ceiling CPM = $31,000
    expect(demo.headline.impressionValueCents).toBe(3_100_000);
    expect(demo.headline.totalCents).toBe(7_340_000);
  });

  it('computes the value-vs-fee multiple to one decimal', () => {
    expect(demo.valueVsFeeMultiple).toBe(1.5);
  });

  it('orders the three tiers conservative <= typical <= aggressive', () => {
    const [cons, typ, agg] = demo.tiers;
    expect(cons.totalCents).toBeLessThanOrEqual(typ.totalCents);
    expect(typ.totalCents).toBeLessThanOrEqual(agg.totalCents);
    expect(demo.headline).toBe(typ);
  });

  it('downshifts to dinner-parity when the qualified mix is below 60%', () => {
    const low = computeEquivalentMediaValue({ attendeeCount: 30, qualifiedMix: 0.4, totalReach: 0, rightsFeeCents: null });
    expect(low.downshifted).toBe(true);
    // whole room at the $500 mid dinner parity, no impressions
    expect(low.headline.audienceValueCents).toBe(30 * 500 * 100);
    expect(low.headline.impressionValueCents).toBe(0);
    expect(low.valueVsFeeMultiple).toBeNull();
    expect(low.headline.methodology).toMatch(/below the 60% threshold/i);
  });

  it('never produces negative or NaN totals at zero inputs', () => {
    const zero = computeEquivalentMediaValue({ attendeeCount: 0, qualifiedMix: 0, totalReach: 0 });
    for (const t of zero.tiers) {
      expect(t.totalCents).toBe(0);
      expect(Number.isFinite(t.perAttendedCents)).toBe(true);
    }
  });
});

describe('archetype → influence tier mapping', () => {
  it('maps the six archetypes to the five tiers (Host folds into Connector)', () => {
    expect(archetypeToBucket('Patron')).toBe('Founder');
    expect(archetypeToBucket('Builder')).toBe('Operator');
    expect(archetypeToBucket('Maker')).toBe('Creator');
    expect(archetypeToBucket('Curator')).toBe('Tastemaker');
    expect(archetypeToBucket('Connector')).toBe('Connector');
    expect(archetypeToBucket('Host')).toBe('Connector');
  });

  it('treats null/unknown archetypes as Unsegmented', () => {
    expect(archetypeToBucket(null)).toBe('Unsegmented');
    expect(archetypeToBucket(undefined)).toBe('Unsegmented');
    expect(archetypeToBucket('Wizard')).toBe('Unsegmented');
  });

  it('counts Founder and Operator as the qualified-executive tiers', () => {
    expect(QUALIFIED_EXEC_TIERS).toContain('Founder');
    expect(QUALIFIED_EXEC_TIERS).toContain('Operator');
    expect(QUALIFIED_EXEC_TIERS).not.toContain('Connector');
  });
});
