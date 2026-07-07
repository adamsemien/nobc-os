/**
 * Normalize the deterministic In-A-Room tally into the 0-100-per-archetype vector
 * that the rest of the system expects (Apply Scoring v2, Phase 3).
 *
 * The SHAPE comes from the tally (`combined` = tap + typed); the MAGNITUDE comes
 * from the AI fit score (`memberWorthTotal`). This keeps `archetypeScores` on the
 * same 0-100 scale the legacy LLM emitted, so `lib/intelligence/worth.ts` keeps
 * deriving the same 0-30 worth and the charter/standard/waitlist tiers are
 * preserved WITHOUT recalibrating any threshold.
 *
 * WORTH-PRESERVATION PROOF.
 *   worthTotal(v) ~= (Σ v) / 20  (worth.ts sums the six /20 in three pair-groups).
 *   We distribute around `avg = memberWorthTotal` using MEAN-ZERO deviations:
 *     dev[a] = combined[a] - mean(combined)          => Σ dev = 0
 *     v[a]   = avg + spread * (dev[a] / maxAbs)       => Σ v = 6 * avg   (exactly, pre-round/clamp)
 *   Therefore worthTotal(v) ~= (6 * memberWorthTotal) / 20 = 0.3 * memberWorthTotal,
 *   independent of `spread` and of the tally shape. `spread` only tunes how decisive
 *   the reveal blend looks; it never moves worth. Rounding (per pair-group) and clamp
 *   at the 0/100 rails cost at most a point or two at the extremes.
 *
 * PURE. No I/O, no imports beyond the shared tally types.
 */
import {
  STORED_ARCHETYPES,
  zeroArchetypeScores,
  type ArchetypeScore,
  type StoredArchetype,
} from './inRoomTally';

/** Default deviation spread, in points, applied to the mean-zero shape. Tunes the
 *  reveal blend's decisiveness; provably does NOT affect worthTotal (see proof above). */
export const DEFAULT_SPREAD = 25;

const clamp = (lo: number, hi: number, x: number): number => Math.min(hi, Math.max(lo, x));

/**
 * @param combined         tap + typed score per archetype (the tally's combined vector).
 * @param primary          the classified nature (tally winner). Pinned to the top slot.
 * @param memberWorthTotal AI fit, 0-100. Becomes the mean of the output vector.
 * @param spread           deviation spread (default 25). Blend decisiveness only.
 */
export function normalizeArchetypeScores(
  combined: ArchetypeScore,
  primary: StoredArchetype,
  memberWorthTotal: number,
  spread: number = DEFAULT_SPREAD,
): ArchetypeScore {
  const avg = clamp(0, 100, Number.isFinite(memberWorthTotal) ? memberWorthTotal : 0);

  // Mean-zero deviations: Σ dev = 0, so Σ (avg + spread·z) = 6·avg exactly.
  const mean =
    STORED_ARCHETYPES.reduce((sum, a) => sum + combined[a], 0) / STORED_ARCHETYPES.length;
  const dev: ArchetypeScore = zeroArchetypeScores();
  let maxAbs = 1; // floor at 1 so an all-equal combined vector yields z=0 (flat), never /0.
  for (const a of STORED_ARCHETYPES) {
    dev[a] = combined[a] - mean;
    if (Math.abs(dev[a]) > maxAbs) maxAbs = Math.abs(dev[a]);
  }

  const raw: ArchetypeScore = zeroArchetypeScores();
  for (const a of STORED_ARCHETYPES) raw[a] = avg + spread * (dev[a] / maxAbs);

  // Pin the classified primary to the top slot so the reveal's top bar always matches
  // the labeled nature — even when the floor locked a primary whose COMBINED score a
  // large (uncapped) typed swing pushed below a runner-up. Swapping two raw values
  // preserves Σ raw, so worth preservation is untouched.
  let topArch: StoredArchetype = STORED_ARCHETYPES[0];
  for (const a of STORED_ARCHETYPES) if (raw[a] > raw[topArch]) topArch = a;
  if (topArch !== primary) {
    const swap = raw[primary];
    raw[primary] = raw[topArch];
    raw[topArch] = swap;
  }

  const out: ArchetypeScore = zeroArchetypeScores();
  for (const a of STORED_ARCHETYPES) out[a] = clamp(0, 100, Math.round(raw[a]));
  return out;
}
