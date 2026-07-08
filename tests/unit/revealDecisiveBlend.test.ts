/**
 * Reveal B display fix (Phase 5): the reveal reads the DECISIVE `tally.blend`, never a
 * blend recomputed from the normalized `archetypeScores`. This proves WHY the switch
 * matters: for the SAME lopsided combined vector, the tally blend is decisive (73/27)
 * while the normalized vector flattens the top two toward ~55/45 (the dogfood bug).
 *
 * The reveal now persists + reads `tally.blend`; it must never fall back to the
 * `top/(top+second)` recompute this test shows is flat.
 */
import { describe, it, expect } from 'vitest';
import { computeInRoomTally, zeroArchetypeScores } from '@/lib/scoring/inRoomTally';
import { normalizeArchetypeScores } from '@/lib/scoring/normalizeArchetypeScores';

// A clear winner: primary 8 points, runner-up 3. Fed as typedScores so the tally's
// `combined` equals this vector exactly (no taps), isolating the blend math.
const combined = { ...zeroArchetypeScores(), Sage: 8, Connector: 3 };

describe('decisive blend vs flattened normalized vector (the 55/45 fix)', () => {
  it('tally.blend is DECISIVE (73/27), straight from the raw combined points', () => {
    const tally = computeInRoomTally({}, {}, combined);
    expect(tally.primary).toBe('Sage');
    expect(tally.secondary).toBe('Connector');
    expect(tally.blend).toEqual({ primary: 73, secondary: 27 }); // 8/(8+3)
  });

  it('the normalized archetypeScores FLATTEN the same top two toward ~55/45', () => {
    const v = normalizeArchetypeScores(combined, 'Sage', 70);
    // This is exactly what the OLD reveal did: recompute the blend from the vector.
    const flatPrimaryPct = Math.round((v.Sage / (v.Sage + v.Connector)) * 100);
    expect(flatPrimaryPct).toBeGreaterThanOrEqual(52);
    expect(flatPrimaryPct).toBeLessThanOrEqual(60); // ~56 — flat, not 73
  });

  it('the decisive blend is materially more skewed than the flattened recompute', () => {
    const tally = computeInRoomTally({}, {}, combined);
    const v = normalizeArchetypeScores(combined, 'Sage', 70);
    const flatPrimaryPct = Math.round((v.Sage / (v.Sage + v.Connector)) * 100);
    expect(tally.blend.primary).toBeGreaterThan(flatPrimaryPct + 10); // 73 >> ~56
  });
});
