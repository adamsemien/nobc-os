/**
 * Deterministic In-A-Room tally engine (Apply Scoring v2, Phase 2).
 *
 * PURE. No I/O, no DB, no imports. The caller resolves the member's answers and
 * the QuestionOption rows and hands them in; this module does the math only.
 * Spec: `_context/_specs/NoBadOS__spec__apply-scoring-v2__2026-07-07.md` §2, §3.3, §3.4.
 *
 * The six In-A-Room questions (seeded Phase 1) contribute points to the six STORED
 * archetype enums. Point values live in the data (QuestionOption.points) for tap
 * questions; most/least deltas are engine constants per spec (most +2, least -1).
 *
 * Phase 2 is TAP-ONLY: `typedScores` (the AI-graded typed-answer contribution from
 * Phase 3) defaults to an all-zero vector, so behavior is the pure tap tally today.
 * The floor structure (§3.3) is already built so Phase 3 slots typed scores into the
 * seam below without a rewrite.
 */

/** The six STORED enum values, in ALPHABETICAL order (also the deterministic
 *  final tie-break order per §3.3). Member-facing "nature" names are a display
 *  concern and never appear here. */
export const STORED_ARCHETYPES = [
  'Builder',
  'Connector',
  'Host',
  'Patron',
  'Sage',
  'Spark',
] as const;

export type StoredArchetype = (typeof STORED_ARCHETYPES)[number];
export type ArchetypeScore = Record<StoredArchetype, number>;

/** A tap_grid answer is one QuestionOption id. A most_least answer is two. */
export type TapAnswer = string;
export type MostLeastAnswer = { mostId: string; leastId: string };
export type InRoomAnswer = TapAnswer | MostLeastAnswer | null | undefined;

/** Member's In-A-Room answers keyed by stableKey (roomPosition, giftMaking, …). */
export type InRoomAnswers = Record<string, InRoomAnswer>;

/** One QuestionOption row, id-resolved by the caller. archetype is a STORED enum. */
export interface OptionRow {
  archetype: string;
  points: number;
  openerPhrase: string | null;
  stableKey: string;
}
export type OptionsById = Record<string, OptionRow>;

export interface TallyResult {
  /** tap-only totals per archetype, BEFORE any typed grades. */
  tapScores: ArchetypeScore;
  primary: StoredArchetype;
  secondary: StoredArchetype;
  /** normalized to sum 100 for display. */
  blend: { primary: number; secondary: number };
  /** openerPhrase of the picked Q6 (bestSelf) option; null if Q6 unanswered. */
  openerPhrase: string | null;
  /** true when the tap-only margin locked the primary (§3.3). */
  floorLocked: boolean;
  /**
   * Which §3.3 rule broke a primary tie.
   * 'none' = a single clear combined leader OR (degenerate) an exact multi-way tie
   * that Q2/tapScore/Q6 could not separate, resolved by the alphabetical fallback.
   */
  tieBreakUsed: 'none' | 'q2' | 'tapScore' | 'q6';
}

// ── Spec-anchored constants ──────────────────────────────────────────────────
/** Q2 (most/least) — the primary tiebreaker question (§3.3 rule 1). */
const GIFT_MAKING_KEY = 'giftMaking';
/** Q6 (single tap) — sets the reveal opener and is §3.3 tiebreaker rule 3. */
const BEST_SELF_KEY = 'bestSelf';
/** most/least deltas are engine constants: most +2, least always -1 regardless of
 *  the option's stored base (§2 / Phase-1 seed note). Tap points come from the data. */
const MOST_DELTA = 2;
const LEAST_DELTA = -1;
/** §3.3: tap-only leader must beat #2 by this margin to lock the primary. */
const FLOOR_MARGIN = 3;

/** A fresh all-zero archetype vector. Also the Phase-3 `typedScores` default. */
export function zeroArchetypeScores(): ArchetypeScore {
  return { Builder: 0, Connector: 0, Host: 0, Patron: 0, Sage: 0, Spark: 0 };
}

function isStored(a: string): a is StoredArchetype {
  return (STORED_ARCHETYPES as readonly string[]).includes(a);
}

/** Add points to an archetype bucket; unknown/bad archetype strings are ignored (no throw). */
function addPoints(scores: ArchetypeScore, archetype: string, pts: number): void {
  if (isStored(archetype)) scores[archetype] += pts;
}

function isMostLeast(a: InRoomAnswer): a is MostLeastAnswer {
  return typeof a === 'object' && a !== null && 'mostId' in a;
}

/** Fold the raw answers into tap-only scores and capture the tiebreak/opener anchors. */
function computeTapScores(answers: InRoomAnswers, optionsById: OptionsById): {
  tapScores: ArchetypeScore;
  q2MostArch: StoredArchetype | null;
  q6Arch: StoredArchetype | null;
  openerPhrase: string | null;
} {
  const tapScores = zeroArchetypeScores();
  let q2MostArch: StoredArchetype | null = null;
  let q6Arch: StoredArchetype | null = null;
  let openerPhrase: string | null = null;

  for (const [stableKey, answer] of Object.entries(answers)) {
    if (!answer) continue; // unanswered → contributes 0

    if (typeof answer === 'string') {
      // tap_grid (Q1, Q4, Q5, Q6). Sign lives in the data (Q5 options are -2).
      const opt = optionsById[answer];
      if (!opt) continue; // dangling id → 0, no crash
      addPoints(tapScores, opt.archetype, opt.points);
      if (stableKey === BEST_SELF_KEY) {
        openerPhrase = opt.openerPhrase ?? null;
        if (isStored(opt.archetype)) q6Arch = opt.archetype;
      }
    } else if (isMostLeast(answer)) {
      // most_least (Q2, Q3). Engine applies most +2 / least -1; stored base ignored.
      const mostOpt = optionsById[answer.mostId];
      const leastOpt = optionsById[answer.leastId];
      if (mostOpt) addPoints(tapScores, mostOpt.archetype, MOST_DELTA);
      if (leastOpt) addPoints(tapScores, leastOpt.archetype, LEAST_DELTA);
      if (stableKey === GIFT_MAKING_KEY && mostOpt && isStored(mostOpt.archetype)) {
        q2MostArch = mostOpt.archetype;
      }
    }
  }

  return { tapScores, q2MostArch, q6Arch, openerPhrase };
}

/**
 * Compute the deterministic In-A-Room tally.
 *
 * @param answers     member's In-A-Room answers keyed by stableKey.
 * @param optionsById id → QuestionOption lookup (caller supplies from DB).
 * @param typedScores PHASE-3 SEAM. The AI typed-answer grades, per archetype. Defaults
 *   to all-zero so Phase 2 is pure tap. When non-zero: if the tap margin locked the
 *   primary, typed only reshapes blend/secondary; otherwise typed joins the combined
 *   score that decides primary. See the "combined" line and the floor block below.
 */
export function computeInRoomTally(
  answers: InRoomAnswers,
  optionsById: OptionsById,
  typedScores: ArchetypeScore = zeroArchetypeScores(),
): TallyResult {
  const { tapScores, q2MostArch, q6Arch, openerPhrase } = computeTapScores(answers, optionsById);

  // ── PHASE-3 SEAM: combined = tap + typed. This is the ONLY place typed enters. ──
  const combined = zeroArchetypeScores();
  for (const a of STORED_ARCHETYPES) combined[a] = tapScores[a] + typedScores[a];

  // Floor margin is measured on tap-only scores (§3.3): taps are 100% reproducible.
  const tapRanked = [...STORED_ARCHETYPES].sort(
    (x, y) => tapScores[y] - tapScores[x] || x.localeCompare(y),
  );
  const tapLeader = tapRanked[0];
  const floorMargin = tapScores[tapLeader] - tapScores[tapRanked[1]];
  const floorLocked = floorMargin >= FLOOR_MARGIN;

  let primary: StoredArchetype;
  let tieBreakUsed: TallyResult['tieBreakUsed'] = 'none';

  if (floorLocked) {
    // Primary is LOCKED to the tap leader. Even a large typed swing cannot move it —
    // typedScores were never consulted for `primary` on this branch.
    primary = tapLeader;
  } else {
    // Genuine near-tie: the combined (tap + typed) score decides primary.
    const maxCombined = Math.max(...STORED_ARCHETYPES.map((a) => combined[a]));
    const candidates = STORED_ARCHETYPES.filter((a) => combined[a] === maxCombined);

    if (candidates.length === 1) {
      primary = candidates[0];
    } else if (q2MostArch && candidates.includes(q2MostArch)) {
      primary = q2MostArch; // §3.3 rule 1: Q2 most-pick
      tieBreakUsed = 'q2';
    } else {
      // §3.3 rule 2: higher tap-only score, among the still-tied set.
      const maxTap = Math.max(...candidates.map((a) => tapScores[a]));
      const tapWinners = candidates.filter((a) => tapScores[a] === maxTap);
      if (tapWinners.length === 1) {
        primary = tapWinners[0];
        tieBreakUsed = 'tapScore';
      } else if (q6Arch && tapWinners.includes(q6Arch)) {
        primary = q6Arch; // §3.3 rule 3: Q6 pick
        tieBreakUsed = 'q6';
      } else {
        // Documented deterministic fallback: alphabetical by stored enum. tieBreakUsed
        // stays 'none' (none of the three spec rules separated the tie).
        primary = [...tapWinners].sort((x, y) => x.localeCompare(y))[0];
      }
    }
  }

  // Secondary = next-highest combined, excluding primary. Deterministic tie-break:
  // higher tapScore, then alphabetical.
  const secondary = STORED_ARCHETYPES.filter((a) => a !== primary).sort(
    (x, y) => combined[y] - combined[x] || tapScores[y] - tapScores[x] || x.localeCompare(y),
  )[0];

  // Blend: normalize the NON-NEGATIVE parts of the top-two combined scores to sum 100.
  // Non-negative guard keeps a negative runner-up from producing >100 / <0 percentages.
  const pPos = Math.max(0, combined[primary]);
  const sPos = Math.max(0, combined[secondary]);
  const denom = pPos + sPos;
  const primaryPct = denom === 0 ? 50 : Math.round((pPos / denom) * 100);
  const secondaryPct = denom === 0 ? 50 : 100 - primaryPct;

  return {
    tapScores,
    primary,
    secondary,
    blend: { primary: primaryPct, secondary: secondaryPct },
    openerPhrase,
    floorLocked,
    tieBreakUsed,
  };
}
