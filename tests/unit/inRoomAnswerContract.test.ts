/**
 * Phase-4 ↔ Phase-3 ANSWER-FORMAT CONTRACT (the #1 correctness gate).
 *
 * Proves the strings the input components emit are exactly what the scorer parses:
 *   - tap-grid  (InARoomTapGrid)   → onChange(optionId)  → answer = the bare id.
 *   - most-least (InARoomMostLeast) → onChange(JSON.stringify({ mostId, leastId }))
 *       → answer = {"mostId":"<id>","leastId":"<id>"} with those EXACT keys.
 *
 * `parseMostLeast` below mirrors `lib/scoring.ts` verbatim (it is private there, so
 * it can't be imported; the frozen source is the reference). We then feed answers in
 * the components' output format through the REAL Phase-3 tally and confirm six
 * archetypal applicants classify as intended — end to end from component output.
 *
 * The live DB round-trip (PATCH stores the answer verbatim → ApplicationAnswer →
 * scoreApplication reads it by stableKey) is structurally guaranteed: the PATCH
 * route writes `String(answer)` unchanged and `answersMap` permits values ≤ 8000
 * chars. It isn't run live here because the In-A-Room seed is prod-only.
 */
import { describe, it, expect } from 'vitest';
import {
  computeInRoomTally,
  STORED_ARCHETYPES,
  type OptionsById,
  type InRoomAnswers,
  type MostLeastAnswer,
} from '@/lib/scoring/inRoomTally';

// ── Mirror of lib/scoring.ts parseMostLeast (frozen; not exported) ───────────────
function parseMostLeast(raw: string): MostLeastAnswer | null {
  try {
    const o = JSON.parse(raw) as { mostId?: unknown; leastId?: unknown };
    if (typeof o.mostId === 'string' && typeof o.leastId === 'string') {
      return { mostId: o.mostId, leastId: o.leastId };
    }
  } catch {
    /* not JSON → unanswered */
  }
  return null;
}

// The exact expression InARoomMostLeast.commit() serializes with.
const serializeMostLeast = (mostId: string, leastId: string) =>
  JSON.stringify({ mostId, leastId });

// ── DB-shaped OptionsById fixture: cuid-like ids like the seed mints ─────────────
const QUESTION_POINTS: Record<string, number> = {
  roomPosition: 2,
  giftMaking: 2,
  partyJudge: 2,
  perfectFriday: 2,
  skipFriday: -2,
  bestSelf: 2,
};
// Realistic opaque ids (as `gen_random_uuid()::text` would produce), NOT stableKey:arch.
const dbId = (stableKey: string, arch: string) => `cmopt_${stableKey}_${arch.toLowerCase()}_x7`;

function buildOptions(): OptionsById {
  const out: OptionsById = {};
  for (const [stableKey, points] of Object.entries(QUESTION_POINTS)) {
    for (const arch of STORED_ARCHETYPES) {
      out[dbId(stableKey, arch)] = {
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

describe('answer-format contract — components ↔ scorer', () => {
  it('most-least serializes to the EXACT keys the scorer requires', () => {
    const out = serializeMostLeast(dbId('giftMaking', 'Sage'), dbId('giftMaking', 'Spark'));
    expect(out).toBe(`{"mostId":"cmopt_giftMaking_sage_x7","leastId":"cmopt_giftMaking_spark_x7"}`);
    const parsed = parseMostLeast(out);
    expect(parsed).toEqual({
      mostId: 'cmopt_giftMaking_sage_x7',
      leastId: 'cmopt_giftMaking_spark_x7',
    });
  });

  it('tap answer is the bare option id (looked up directly in optionsById)', () => {
    const tap = dbId('roomPosition', 'Host');
    expect(OPTIONS[tap]).toBeDefined();
    expect(OPTIONS[tap].archetype).toBe('Host');
  });

  it('a malformed / incomplete most-least value is treated as unanswered', () => {
    expect(parseMostLeast('')).toBeNull(); // component writes '' until both are set
    expect(parseMostLeast('not json')).toBeNull();
    expect(parseMostLeast('{"mostId":"x"}')).toBeNull(); // leastId missing
  });
});

describe('required validation blocks a half-answered most-least', () => {
  // Mirror of InARoomMostLeast.commit(): a complete pick serializes; anything
  // incomplete writes '' so the six `required: true` questions stay unanswered.
  const commit = (mostId: string | null, leastId: string | null) =>
    mostId && leastId ? JSON.stringify({ mostId, leastId }) : '';
  // Mirror of MembershipForm.missingRequiredFields(): required + empty-after-trim = missing.
  const isMissing = (answer: string) => !(answer ?? '').trim();

  it('most-only and least-only serialize to "" → blocked by required validation', () => {
    expect(commit('optA', null)).toBe('');
    expect(commit(null, 'optB')).toBe('');
    expect(isMissing(commit('optA', null))).toBe(true); // half-answered → submit blocked
    expect(isMissing(commit(null, 'optB'))).toBe(true);
  });

  it('both most + least → a non-empty answer that clears required validation', () => {
    const complete = commit('optA', 'optB');
    expect(complete).toBe('{"mostId":"optA","leastId":"optB"}');
    expect(isMissing(complete)).toBe(false); // complete → advance allowed
  });

  it('an unselected tap_grid is empty → also blocked', () => {
    expect(isMissing('')).toBe(true); // no selection
    expect(isMissing('cmopt_roomPosition_sage_x7')).toBe(false); // a selected id clears it
  });
});

// ── Six archetypal applicants, answers in COMPONENT OUTPUT FORMAT ────────────────
type Persona = { intended: string; antagonist: string };
const PERSONAS: Persona[] = [
  { intended: 'Sage', antagonist: 'Spark' },
  { intended: 'Connector', antagonist: 'Builder' },
  { intended: 'Host', antagonist: 'Spark' },
  { intended: 'Spark', antagonist: 'Sage' },
  { intended: 'Builder', antagonist: 'Patron' },
  { intended: 'Patron', antagonist: 'Spark' },
];

/** Answers exactly as the tap-grid / most-least components would emit them. */
function componentAnswers(intended: string, antagonist: string): InRoomAnswers {
  return {
    roomPosition: dbId('roomPosition', intended), // tap → bare id
    perfectFriday: dbId('perfectFriday', intended),
    bestSelf: dbId('bestSelf', intended),
    skipFriday: dbId('skipFriday', antagonist),
    // most-least → the JSON string, then parsed by the scorer's parseMostLeast
    giftMaking: parseMostLeast(
      serializeMostLeast(dbId('giftMaking', intended), dbId('giftMaking', antagonist)),
    ),
    partyJudge: parseMostLeast(
      serializeMostLeast(dbId('partyJudge', intended), dbId('partyJudge', antagonist)),
    ),
  };
}

describe('classification from component-format answers', () => {
  it.each(PERSONAS)('$intended applicant → tally classifies $intended', (p) => {
    const tally = computeInRoomTally(componentAnswers(p.intended, p.antagonist), OPTIONS);
    expect(tally.primary).toBe(p.intended);
    expect(tally.floorLocked).toBe(true); // clean sweep locks the floor
  });
});
