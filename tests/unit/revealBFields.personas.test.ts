/**
 * Reveal B dev-verify (Phase 5): six archetypal applicants, in the input components'
 * OUTPUT format, run through the REAL deterministic tally. Proves that for each nature
 * the reveal receives the three things Reveal B needs:
 *   1. the Q6 openerPhrase (the reveal OPENS on it — layer 1),
 *   2. a DECISIVE blend (not the flattened ~55/45), and
 *   3. the correct primary nature.
 *
 * This is the data-layer proof behind the visual reveal. The live browser render uses
 * the same fields (persisted by scoreApplication → read by MembershipForm); the
 * prod-only In-A-Room seed is not in the dev DB, so classification is exercised here
 * against the pure tally exactly as the answer-format contract test does.
 */
import { describe, it, expect } from 'vitest';
import {
  computeInRoomTally,
  STORED_ARCHETYPES,
  type OptionsById,
  type InRoomAnswers,
} from '@/lib/scoring/inRoomTally';
import { archetypeDisplayName } from '@/config/archetypes';

const QUESTION_POINTS: Record<string, number> = {
  roomPosition: 2,
  giftMaking: 2,
  partyJudge: 2,
  perfectFriday: 2,
  skipFriday: -2,
  bestSelf: 2,
};
const dbId = (stableKey: string, arch: string) => `cmopt_${stableKey}_${arch.toLowerCase()}`;

function buildOptions(): OptionsById {
  const out: OptionsById = {};
  for (const [stableKey, points] of Object.entries(QUESTION_POINTS)) {
    for (const arch of STORED_ARCHETYPES) {
      out[dbId(stableKey, arch)] = {
        archetype: arch,
        points,
        // Q6 (bestSelf) carries the reveal opener, in the member's own words.
        openerPhrase: stableKey === 'bestSelf' ? `At your best, ${arch}` : null,
        stableKey,
      };
    }
  }
  return out;
}
const OPTIONS = buildOptions();

/** A clean-sweep applicant in the components' output format. */
function sweep(intended: string, antagonist: string): InRoomAnswers {
  return {
    roomPosition: dbId('roomPosition', intended),
    perfectFriday: dbId('perfectFriday', intended),
    bestSelf: dbId('bestSelf', intended),
    skipFriday: dbId('skipFriday', antagonist),
    giftMaking: { mostId: dbId('giftMaking', intended), leastId: dbId('giftMaking', antagonist) },
    partyJudge: { mostId: dbId('partyJudge', intended), leastId: dbId('partyJudge', antagonist) },
  };
}

const PERSONAS: Array<{ intended: string; antagonist: string; display: string }> = [
  { intended: 'Sage', antagonist: 'Spark', display: 'Sage' },
  { intended: 'Spark', antagonist: 'Sage', display: 'Spark' },
  { intended: 'Host', antagonist: 'Spark', display: 'Caregiver' }, // legacy enum → display name
  { intended: 'Patron', antagonist: 'Spark', display: 'Champion' }, // legacy enum → display name
  { intended: 'Builder', antagonist: 'Patron', display: 'Builder' },
  { intended: 'Connector', antagonist: 'Builder', display: 'Connector' },
];

describe('Reveal B fields — six archetypal applicants', () => {
  it.each(PERSONAS)('$intended → opens on Q6 phrase, decisive blend, correct nature', (p) => {
    const tally = computeInRoomTally(sweep(p.intended, p.antagonist), OPTIONS);

    // (3) correct nature, and the member-facing display name never leaks the enum.
    expect(tally.primary).toBe(p.intended);
    expect(archetypeDisplayName(tally.primary)).toBe(p.display);

    // (1) the reveal opens on the applicant's own Q6 phrase.
    expect(tally.openerPhrase).toBe(`At your best, ${p.intended}`);

    // (2) the blend is DECISIVE — a clean sweep is nowhere near the flat ~55/45.
    expect(tally.blend.primary).toBeGreaterThanOrEqual(60);
    expect(tally.blend.primary + tally.blend.secondary).toBe(100);
    expect(tally.floorLocked).toBe(true);
  });
});
