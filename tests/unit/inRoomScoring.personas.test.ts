/**
 * Dev-applicant verification for the inverted scorer (Apply Scoring v2, Phase 3).
 *
 * Exercises the REAL deterministic core of scoreApplication() in the same order —
 * computeInRoomTally → aggregateTypedScores → normalizeArchetypeScores → worthTotal —
 * on six synthetic archetypal applicants. The grader's memberWorthTotal is supplied
 * directly (simulating the one Sonnet call) so this runs with no DB and no API key,
 * which is the honest reproducible verification given prod creds are out of reach.
 *
 * Proves, end-to-end: (1) the tally classifies each applicant as intended,
 * (2) the reveal top bar matches the labeled nature, (3) worth ≈ 0.3 × fit so the
 * charter/standard/waitlist tier is right.
 */
import { describe, it, expect } from 'vitest';
import {
  computeInRoomTally,
  zeroArchetypeScores,
  STORED_ARCHETYPES,
  type OptionsById,
  type InRoomAnswers,
  type ArchetypeScore,
} from '@/lib/scoring/inRoomTally';
import { aggregateTypedScores, type TypedGrade } from '@/lib/scoring/gradeTypedAnswers';
import { normalizeArchetypeScores } from '@/lib/scoring/normalizeArchetypeScores';
import { worthTotal, worthTier } from '@/lib/intelligence/worth';

// ── OptionsById fixture mirroring the Phase-1 seed (Q5 skip = -2, rest +2) ──────
const QUESTION_POINTS: Record<string, number> = {
  roomPosition: 2,
  giftMaking: 2,
  partyJudge: 2,
  perfectFriday: 2,
  skipFriday: -2,
  bestSelf: 2,
};
const optId = (stableKey: string, arch: string) => `${stableKey}:${arch}`;
function buildOptions(): OptionsById {
  const out: OptionsById = {};
  for (const [stableKey, points] of Object.entries(QUESTION_POINTS)) {
    for (const arch of STORED_ARCHETYPES) {
      out[optId(stableKey, arch)] = {
        archetype: arch,
        points,
        openerPhrase: stableKey === 'bestSelf' ? `opener:${arch}` : null,
        stableKey,
      };
    }
  }
  return out;
}
const OPTIONS = buildOptions();

const argmax = (v: ArchetypeScore) =>
  [...STORED_ARCHETYPES].sort((x, y) => v[y] - v[x] || x.localeCompare(y))[0];

/** Build a clean archetypal applicant: sweeps taps to `intended`, skips `antagonist`. */
function personaAnswers(intended: string, antagonist: string): InRoomAnswers {
  return {
    roomPosition: optId('roomPosition', intended),
    perfectFriday: optId('perfectFriday', intended),
    bestSelf: optId('bestSelf', intended),
    giftMaking: { mostId: optId('giftMaking', intended), leastId: optId('giftMaking', antagonist) },
    partyJudge: { mostId: optId('partyJudge', intended), leastId: optId('partyJudge', antagonist) },
    skipFriday: optId('skipFriday', antagonist),
  };
}

/** Synthetic typed grades leaning toward `intended`, plus a secondary. */
function typedGrades(intended: string, secondary: string): TypedGrade['typedGrades'] {
  return [
    { questionKey: 'q1', awards: [{ archetype: intended as never, points: 2 }] },
    { questionKey: 'q2', awards: [{ archetype: intended as never, points: 2 }] },
    { questionKey: 'q3', awards: [{ archetype: intended as never, points: 2 }] },
    { questionKey: 'q4', awards: [{ archetype: secondary as never, points: 1 }] },
  ];
}

type Persona = {
  intended: string;
  antagonist: string;
  secondary: string;
  memberWorthTotal: number;
  expectTier: 'charter' | 'standard' | 'waitlist';
};

const PERSONAS: Persona[] = [
  { intended: 'Sage', antagonist: 'Spark', secondary: 'Connector', memberWorthTotal: 78, expectTier: 'charter' },
  { intended: 'Connector', antagonist: 'Builder', secondary: 'Host', memberWorthTotal: 62, expectTier: 'standard' },
  { intended: 'Host', antagonist: 'Spark', secondary: 'Patron', memberWorthTotal: 55, expectTier: 'standard' },
  { intended: 'Spark', antagonist: 'Sage', secondary: 'Connector', memberWorthTotal: 70, expectTier: 'standard' },
  { intended: 'Builder', antagonist: 'Patron', secondary: 'Sage', memberWorthTotal: 48, expectTier: 'waitlist' },
  { intended: 'Patron', antagonist: 'Spark', secondary: 'Host', memberWorthTotal: 40, expectTier: 'waitlist' },
];

/** Run the real deterministic pipeline for one persona. */
function score(p: Persona) {
  const typedScores = aggregateTypedScores(typedGrades(p.intended, p.secondary));
  const tally = computeInRoomTally(personaAnswers(p.intended, p.antagonist), OPTIONS, typedScores);
  const combined = zeroArchetypeScores();
  for (const a of STORED_ARCHETYPES) combined[a] = tally.tapScores[a] + typedScores[a];
  const archetypeScores = normalizeArchetypeScores(combined, tally.primary, p.memberWorthTotal);
  return { tally, archetypeScores, worth: worthTotal(archetypeScores), tier: worthTier(worthTotal(archetypeScores)) };
}

describe('inverted scorer — dev-applicant verification', () => {
  it('prints the verification table', () => {
    const rows = PERSONAS.map((p) => {
      const r = score(p);
      const top = argmax(r.archetypeScores);
      const ok = r.tally.primary === p.intended && top === p.intended && r.tier === p.expectTier;
      return (
        `${ok ? '✓' : '✗'} intended ${p.intended.padEnd(10)}→ nature ${String(r.tally.primary).padEnd(10)}` +
        ` topBar ${top.padEnd(10)} fit ${String(p.memberWorthTotal).padStart(3)} worth ${String(r.worth).padStart(2)}` +
        ` tier ${r.tier.padEnd(9)} floorLocked ${r.tally.floorLocked}`
      );
    });
    // eslint-disable-next-line no-console
    console.log('\n── Apply Scoring v2 dev-applicant verification ──\n' + rows.join('\n') + '\n');
    expect(rows.every((r) => r.startsWith('✓'))).toBe(true);
  });

  it.each(PERSONAS)(
    '$intended applicant → classified $intended, top bar $intended, tier $expectTier',
    (p) => {
      const r = score(p);
      expect(r.tally.primary).toBe(p.intended); // tally classifies as intended
      expect(r.tally.floorLocked).toBe(true); // clean sweep locks the floor
      expect(argmax(r.archetypeScores)).toBe(p.intended); // reveal top bar = nature
      expect(r.tier).toBe(p.expectTier); // worth ≈ 0.3 × fit → right tier
      expect(Math.abs(r.worth - 0.3 * p.memberWorthTotal)).toBeLessThanOrEqual(2);
    },
  );
});
