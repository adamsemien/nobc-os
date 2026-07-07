import { describe, it, expect } from 'vitest';
import {
  computeInRoomTally,
  zeroArchetypeScores,
  STORED_ARCHETYPES,
  type OptionsById,
  type InRoomAnswers,
} from '@/lib/scoring/inRoomTally';

// ── Fixture: build an optionsById mirroring the Phase-1 seed ──────────────────
// One option per archetype per question. Tap points live in the data; Q5 is -2.
const QUESTION_POINTS: Record<string, number> = {
  roomPosition: 2, // Q1 tap
  giftMaking: 2, // Q2 most/least (base; deltas are engine constants)
  partyJudge: 2, // Q3 most/least
  perfectFriday: 2, // Q4 tap
  skipFriday: -2, // Q5 tap (anti-signal)
  bestSelf: 2, // Q6 tap + opener
};
const OPENER: Record<string, string> = {
  Spark: 'Magnetic',
  Host: 'The reason it felt like home',
  Sage: 'The best conversation there',
  Connector: "The night's best introduction",
  Patron: "Someone's whole cheering section",
  Builder: 'The reason they finally started something',
};

const optId = (stableKey: string, arch: string) => `${stableKey}:${arch}`;

function buildOptions(): OptionsById {
  const out: OptionsById = {};
  for (const [stableKey, points] of Object.entries(QUESTION_POINTS)) {
    for (const arch of STORED_ARCHETYPES) {
      out[optId(stableKey, arch)] = {
        archetype: arch,
        points,
        openerPhrase: stableKey === 'bestSelf' ? OPENER[arch] : null,
        stableKey,
      };
    }
  }
  return out;
}
const OPTIONS = buildOptions();

// helpers
const tap = (stableKey: string, arch: string) => optId(stableKey, arch);
const mostLeast = (mostArch: string, leastArch: string, key = 'giftMaking') => ({
  mostId: optId(key, mostArch),
  leastId: optId(key, leastArch),
});

describe('computeInRoomTally', () => {
  it('clean single-archetype sweep → that archetype primary, floorLocked true', () => {
    const answers: InRoomAnswers = {
      roomPosition: tap('roomPosition', 'Sage'), // +2
      perfectFriday: tap('perfectFriday', 'Sage'), // +2
      bestSelf: tap('bestSelf', 'Sage'), // +2 + opener
      giftMaking: mostLeast('Sage', 'Spark'), // Sage +2, Spark -1
      partyJudge: mostLeast('Sage', 'Spark', 'partyJudge'), // Sage +2, Spark -1
      skipFriday: tap('skipFriday', 'Spark'), // Spark -2
    };
    const r = computeInRoomTally(answers, OPTIONS);
    expect(r.tapScores.Sage).toBe(10);
    expect(r.tapScores.Spark).toBe(-4);
    expect(r.primary).toBe('Sage');
    expect(r.floorLocked).toBe(true);
    expect(r.openerPhrase).toBe('The best conversation there');
    expect(r.blend.primary + r.blend.secondary).toBe(100);
    expect(r.blend.primary).toBe(100); // secondary is 0 → pure primary
  });

  it('Q5 anti-signal subtracts (negative points applied)', () => {
    // only the skip answered, pointing at Spark → Spark -2
    const onlySkip = computeInRoomTally({ skipFriday: tap('skipFriday', 'Spark') }, OPTIONS);
    expect(onlySkip.tapScores.Spark).toBe(-2);

    // thrive + skip on the SAME archetype cancels to 0
    const thriveThenSkip = computeInRoomTally(
      { perfectFriday: tap('perfectFriday', 'Spark'), skipFriday: tap('skipFriday', 'Spark') },
      OPTIONS,
    );
    expect(thriveThenSkip.tapScores.Spark).toBe(0);
  });

  it('most/least: most +2 and least -1 land on the correct archetypes', () => {
    const r = computeInRoomTally({ giftMaking: mostLeast('Connector', 'Builder') }, OPTIONS);
    expect(r.tapScores.Connector).toBe(2); // most → +2
    // least → -1, and NOT the stored +2 base of the Builder option
    expect(r.tapScores.Builder).toBe(-1);
    expect(OPTIONS[optId('giftMaking', 'Builder')].points).toBe(2); // stored base is +2…
    // …but the engine applied -1 for the least pick, proving stored base is ignored there.
  });

  it('near-tie (tap margin < 3) → floorLocked false', () => {
    // Sage 4, Connector 2 → margin 2 < 3
    const answers: InRoomAnswers = {
      roomPosition: tap('roomPosition', 'Sage'), // Sage +2
      perfectFriday: tap('perfectFriday', 'Sage'), // Sage +2
      bestSelf: tap('bestSelf', 'Connector'), // Connector +2
    };
    const r = computeInRoomTally(answers, OPTIONS);
    expect(r.tapScores.Sage).toBe(4);
    expect(r.tapScores.Connector).toBe(2);
    expect(r.floorLocked).toBe(false);
    expect(r.primary).toBe('Sage'); // highest combined
  });

  it('clear lead (margin ≥ 3): a non-zero typedScores vector canNOT flip a locked primary', () => {
    const answers: InRoomAnswers = {
      roomPosition: tap('roomPosition', 'Sage'), // Sage +2
      perfectFriday: tap('perfectFriday', 'Sage'), // Sage +2  → Sage 4, runner-up 0, margin 4
    };
    const typed = zeroArchetypeScores();
    typed.Connector = 10; // would win on combined (Connector 10 > Sage 4) IF not locked

    const r = computeInRoomTally(answers, OPTIONS, typed);
    expect(r.floorLocked).toBe(true);
    expect(r.primary).toBe('Sage'); // locked — typed did not flip it
    expect(r.secondary).toBe('Connector'); // typed DID reshape the secondary
    expect(r.blend.primary + r.blend.secondary).toBe(100);
  });

  it('tie-break: an exact combined tie is broken by the Q2 most-pick (tieBreakUsed = q2)', () => {
    // Sage 2 (via Q2 most) and Connector 2 (via Q6) tie for the top; equal tap scores so
    // rule 2 (tapScore) can't separate them → Q2 most-pick (Sage) decides.
    const answers: InRoomAnswers = {
      bestSelf: tap('bestSelf', 'Connector'), // Connector +2
      giftMaking: mostLeast('Sage', 'Patron'), // Sage +2, Patron -1
    };
    const r = computeInRoomTally(answers, OPTIONS);
    expect(r.tapScores.Sage).toBe(2);
    expect(r.tapScores.Connector).toBe(2);
    expect(r.floorLocked).toBe(false);
    expect(r.primary).toBe('Sage');
    expect(r.tieBreakUsed).toBe('q2');
  });

  it('openerPhrase surfaces from the picked Q6 option (and is null when Q6 unanswered)', () => {
    const withQ6 = computeInRoomTally({ bestSelf: tap('bestSelf', 'Patron') }, OPTIONS);
    expect(withQ6.openerPhrase).toBe("Someone's whole cheering section");

    const withoutQ6 = computeInRoomTally({ roomPosition: tap('roomPosition', 'Patron') }, OPTIONS);
    expect(withoutQ6.openerPhrase).toBeNull();
  });

  it('unanswered / dangling ids contribute 0 and never crash', () => {
    const empty = computeInRoomTally({}, OPTIONS);
    expect(Object.values(empty.tapScores).every((v) => v === 0)).toBe(true);
    expect(empty.blend).toEqual({ primary: 50, secondary: 50 });
    expect(empty.floorLocked).toBe(false);
    expect(empty.tieBreakUsed).toBe('none');
    expect(empty.primary).toBe('Builder'); // documented alphabetical fallback
    expect(STORED_ARCHETYPES).toContain(empty.secondary);

    // dangling tap id → 0
    const dangling = computeInRoomTally({ roomPosition: 'roomPosition:Nope' }, OPTIONS);
    expect(Object.values(dangling.tapScores).every((v) => v === 0)).toBe(true);

    // most_least with a missing leastId → most still applies, no crash
    const partial = computeInRoomTally(
      { giftMaking: { mostId: optId('giftMaking', 'Sage'), leastId: 'missing:id' } },
      OPTIONS,
    );
    expect(partial.tapScores.Sage).toBe(2);
  });
});
