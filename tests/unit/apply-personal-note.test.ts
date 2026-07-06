/** Reveal "why we called you this" personal-note logic (six-archetype recut).
 *
 *  Tests the pure money-path helper directly (`@/lib/applications/personal-note`)
 *  rather than through the /apply submit route — the route transitively imports a
 *  client email component that does not parse under Vitest, and this logic is the
 *  only uncovered money-path piece. Covers the deterministic top-signal pick
 *  (rubric-weight order, tiebreak, resolveAnswer group bridging) and the failure
 *  path (model throws -> null, no crash, reveal beat omitted). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOP_SIGNAL_KEYS,
  NOTE_FALLBACK,
  pickTopSignal,
  sanitizeNote,
  buildPersonalNote,
} from '@/lib/applications/personal-note';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pickTopSignal — deterministic top-archetype evidence answer', () => {
  it('picks the highest-weight signal (first in rubric order) that has an answer', () => {
    // Builder rubric order: whatYouDo > characteristicsGoodAtJob > obsessedWith > creativePursuits.
    // Multiple present -> the earliest (highest-weight) key wins the tiebreak.
    const picked = pickTopSignal('Builder', {
      whatYouDo: 'I ship developer tools',
      characteristicsGoodAtJob: 'persistence',
      obsessedWith: 'open source',
    });
    expect(picked).toEqual({ key: 'whatYouDo', answer: 'I ship developer tools' });
  });

  it('skips empty / whitespace-only higher-weight keys to the next non-empty one', () => {
    const picked = pickTopSignal('Builder', {
      whatYouDo: '   ', // present but blank -> skipped
      characteristicsGoodAtJob: 'I make the hard call look obvious',
    });
    expect(picked).toEqual({
      key: 'characteristicsGoodAtJob',
      answer: 'I make the hard call look obvious',
    });
  });

  it('resolves the referrals GROUP via resolveAnswer (dotted sub-field bridge)', () => {
    // Connector rubric order: connectionCreated > referrals > ...
    // connectionCreated is absent, so the pick falls through to the referrals
    // group, which only exists as dotted sub-field keys — resolveAnswer must
    // bridge + join them for the pick to see a non-empty answer.
    const picked = pickTopSignal('Connector', {
      'referrals.referral1First': 'Ada',
      'referrals.referral1Last': 'Lovelace',
      'referrals.referral2First': 'Grace',
      'referrals.referral2Last': 'Hopper',
    });
    expect(picked.key).toBe('referrals');
    expect(picked.answer).toBe('Ada\nLovelace\nGrace\nHopper');
  });

  it('returns blanks for an unknown archetype', () => {
    expect(pickTopSignal('Curator', { whatYouDo: 'anything' })).toEqual({
      key: '',
      answer: '',
    });
  });

  it('returns blanks when the top archetype has no non-empty signal answers', () => {
    expect(pickTopSignal('Sage', { obsessedWith: '' , characteristicsGoodAtJob: '  ' })).toEqual({
      key: '',
      answer: '',
    });
  });

  it('covers all six stored archetype enums', () => {
    expect(Object.keys(TOP_SIGNAL_KEYS).sort()).toEqual(
      ['Builder', 'Connector', 'Host', 'Patron', 'Sage', 'Spark'].sort(),
    );
  });
});

describe('sanitizeNote — draft guard before verbatim reveal render', () => {
  it('returns a clean draft trimmed', () => {
    expect(sanitizeNote('  You build things people rely on.  ')).toBe(
      'You build things people rely on.',
    );
  });

  it('returns null for an empty / whitespace-only draft (beat omitted)', () => {
    expect(sanitizeNote('')).toBeNull();
    expect(sanitizeNote('   \n  ')).toBeNull();
  });

  it('swaps meta-commentary for the safe fallback', () => {
    expect(sanitizeNote("Here's a warm note for the applicant: you are great.")).toBe(
      NOTE_FALLBACK,
    );
    expect(sanitizeNote('If you want, I can rewrite this to be warmer.')).toBe(NOTE_FALLBACK);
    expect(sanitizeNote('The application looks like test data.')).toBe(NOTE_FALLBACK);
  });
});

describe('buildPersonalNote — end-to-end assembly + failure handling', () => {
  const answers = {
    comeToYouFor: 'technical advice when the stakes are high',
    walkIntoRoom: 'find the one person standing alone and make them laugh',
    whatYouDo: 'I ship developer tools',
    characteristicsGoodAtJob: 'persistence',
  };

  it('feeds exactly the three evidence answers (top signal = highest-weight) into the prompt', async () => {
    let captured = '';
    const note = await buildPersonalNote({
      archetype: 'Builder',
      answersByKey: answers,
      generate: async (prompt) => {
        captured = prompt;
        return 'You are the person who makes the hard thing shippable.';
      },
    });

    expect(note).toBe('You are the person who makes the hard thing shippable.');
    expect(captured).toContain('What people come to them for: technical advice when the stakes are high');
    expect(captured).toContain('Walking into a room of strangers, they: find the one person standing alone and make them laugh');
    // Builder's highest-weight non-empty signal is whatYouDo — the rubric-order
    // tiebreak means characteristicsGoodAtJob (lower weight) is NOT chosen.
    expect(captured).toContain('whatYouDo: I ship developer tools');
    expect(captured).not.toContain('characteristicsGoodAtJob:');
  });

  it('FAILURE PATH: model throws -> null, no crash (reveal omits the beat)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const note = await buildPersonalNote({
      archetype: 'Builder',
      answersByKey: answers,
      generate: async () => {
        throw new Error('model unavailable');
      },
    });
    expect(note).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('still composes when only the two always-passed answers exist (no top signal)', async () => {
    let captured = '';
    const note = await buildPersonalNote({
      archetype: 'Spark',
      answersByKey: {
        comeToYouFor: 'the plan for the night',
        walkIntoRoom: 'start a conversation with everyone',
      },
      generate: async (prompt) => {
        captured = prompt;
        return 'You are the spark that starts the night.';
      },
    });
    expect(note).toBe('You are the spark that starts the night.');
    expect(captured).toContain('What people come to them for: the plan for the night');
    // No non-empty Spark signal answer -> no third evidence line.
    expect(captured).not.toContain('unplannedFun:');
    expect(captured).not.toContain('meetPeople:');
  });
});
