import { describe, it, expect } from 'vitest';
import {
  normalizeArchetypeScores,
  DEFAULT_SPREAD,
} from '@/lib/scoring/normalizeArchetypeScores';
import { STORED_ARCHETYPES, zeroArchetypeScores, type ArchetypeScore } from '@/lib/scoring/inRoomTally';
import { worthTotal, worthTier } from '@/lib/intelligence/worth';

const sum = (v: ArchetypeScore) => STORED_ARCHETYPES.reduce((s, a) => s + v[a], 0);
const argmax = (v: ArchetypeScore) =>
  [...STORED_ARCHETYPES].sort((x, y) => v[y] - v[x] || x.localeCompare(y))[0];

/** A clean single-leader combined shape. */
function leader(arch: string, lead = 10): ArchetypeScore {
  const c = zeroArchetypeScores();
  for (const a of STORED_ARCHETYPES) c[a] = a === arch ? lead : 0;
  return c;
}

describe('normalizeArchetypeScores — worth preservation', () => {
  // The single most important invariant: worth ~= 0.3 * memberWorthTotal, so the
  // charter(22)/standard(16)/waitlist thresholds hold WITHOUT recalibration.
  it('worthTotal ≈ 0.3 × memberWorthTotal across the fit band and shapes', () => {
    const shapes: ArchetypeScore[] = [
      leader('Sage', 10),
      leader('Connector', 4),
      { Builder: 3, Connector: 5, Host: 1, Patron: 0, Sage: 8, Spark: -2 },
      zeroArchetypeScores(), // flat: no in-room signal
    ];
    for (const mWT of [40, 45, 50, 55, 62, 70, 78, 90]) {
      for (const shape of shapes) {
        const primary = argmax(shape); // for a clean shape the leader is the primary
        const v = normalizeArchetypeScores(shape, primary, mWT);
        const worth = worthTotal(v);
        const expected = 0.3 * mWT;
        expect(Math.abs(worth - expected)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('sum(vector) ≈ 6 × memberWorthTotal (mean-zero property), away from the rails', () => {
    for (const mWT of [40, 50, 55, 62]) {
      const v = normalizeArchetypeScores(leader('Host', 9), 'Host', mWT);
      expect(Math.abs(sum(v) - 6 * mWT)).toBeLessThanOrEqual(3); // rounding only
    }
  });

  it('maps fit to the correct tier (charter ≥22, standard ≥16, else waitlist)', () => {
    expect(worthTier(worthTotal(normalizeArchetypeScores(leader('Sage'), 'Sage', 78)))).toBe('charter');
    expect(worthTier(worthTotal(normalizeArchetypeScores(leader('Sage'), 'Sage', 55)))).toBe('standard');
    expect(worthTier(worthTotal(normalizeArchetypeScores(leader('Sage'), 'Sage', 45)))).toBe('waitlist');
  });

  it('spread does NOT move worth (only blend decisiveness)', () => {
    const shape = leader('Spark', 8);
    const wNarrow = worthTotal(normalizeArchetypeScores(shape, 'Spark', 60, 10));
    const wWide = worthTotal(normalizeArchetypeScores(shape, 'Spark', 60, 40));
    expect(Math.abs(wNarrow - wWide)).toBeLessThanOrEqual(1);
  });
});

describe('normalizeArchetypeScores — primary pinning', () => {
  it('primary is always the top bar', () => {
    const v = normalizeArchetypeScores(leader('Patron', 7), 'Patron', 58);
    expect(argmax(v)).toBe('Patron');
    expect(v.Patron).toBe(Math.max(...STORED_ARCHETYPES.map((a) => v[a])));
  });

  it('pins the classified primary even when a typed swing pushed another combined higher', () => {
    // Floor-locked primary = Sage (tap leader), but typed pushed Connector's COMBINED
    // above Sage. The reveal top bar must still be Sage (the labeled nature).
    const combined = zeroArchetypeScores();
    combined.Sage = 4;
    combined.Connector = 12; // higher combined than the primary
    const v = normalizeArchetypeScores(combined, 'Sage', 60);
    expect(argmax(v)).toBe('Sage');
    expect(v.Sage).toBeGreaterThanOrEqual(v.Connector);
    // pinning is a swap, so worth is still preserved
    expect(Math.abs(worthTotal(v) - 0.3 * 60)).toBeLessThanOrEqual(2);
  });
});

describe('normalizeArchetypeScores — bounds & degenerate input', () => {
  it('every score stays within 0..100', () => {
    const v = normalizeArchetypeScores(leader('Builder', 40), 'Builder', 95, DEFAULT_SPREAD);
    for (const a of STORED_ARCHETYPES) {
      expect(v[a]).toBeGreaterThanOrEqual(0);
      expect(v[a]).toBeLessThanOrEqual(100);
    }
  });

  it('flat combined (no in-room signal) → all scores equal the fit average', () => {
    const v = normalizeArchetypeScores(zeroArchetypeScores(), 'Connector', 50);
    for (const a of STORED_ARCHETYPES) expect(v[a]).toBe(50);
    expect(worthTotal(v)).toBe(15); // matches the legacy all-50 fallback worth
  });

  it('non-finite fit degrades to 0 without throwing', () => {
    const v = normalizeArchetypeScores(leader('Sage'), 'Sage', Number.NaN);
    expect(argmax(v)).toBe('Sage');
    for (const a of STORED_ARCHETYPES) expect(Number.isFinite(v[a])).toBe(true);
  });
});
