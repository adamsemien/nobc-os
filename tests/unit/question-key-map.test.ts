import { describe, it, expect } from 'vitest';
import { resolveAnswer, MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY } from '@/lib/question-key-map';
import { QUESTIONS } from '@/app/apply/_lib/questions';

// The scored QuestionDefinition stableKeys - MUST mirror the 13-row rubric in
// scripts/seed-questions.mjs (six-archetype recut, 2026-07). Every stableKey ===
// the live form field id (app/apply/_lib/questions.ts), so simple questions
// resolve by identity and only the one GROUP question (referrals) needs a bridge
// entry. The scorer (lib/scoring.ts) calls resolveAnswer(stableKey, answersByKey)
// for each; if one stops resolving, that answer silently vanishes from scoring -
// the exact regression this file guards.
const SCORED_STABLE_KEYS = [
  'whatYouDo', 'comeToYouFor', 'characteristicsGoodAtJob', 'creativePursuits', 'obsessedWith',
  'referrals', 'cities', 'connectionCreated', 'loyalCommunity', 'goodCompany',
  'walkIntoRoom', 'unplannedFun', 'meetPeople',
] as const;

// The scored GROUP question whose answers live under dotted subfield keys.
const GROUP_KEYS = new Set(['referrals']);

// A representative full answer set, keyed exactly as the live form
// (app/apply/_lib/questions.ts) writes them onto ApplicationAnswer.questionKey:
// bare ids for plain fields, `${groupId}.${subId}` for group fields.
const FORM_ANSWERS: Record<string, string> = {
  whatYouDo: 'I run a design studio',
  comeToYouFor: 'introductions',
  characteristicsGoodAtJob: 'I read people fast and follow through',
  creativePursuits: 'ceramics, a zine',
  obsessedWith: 'natural wine',
  'referrals.referral1First': 'Jane',
  'referrals.referral1Last': 'Doe',
  'referrals.referral2First': 'John',
  'referrals.referral2Last': 'Roe',
  'referrals.referral3First': '',
  'referrals.referral3Last': '',
  cities: 'Austin, NYC',
  connectionCreated: 'introduced two cofounders',
  loyalCommunity: 'my run club for 6 years',
  goodCompany: 'people who ask real questions',
  walkIntoRoom: 'I find the person standing alone',
  unplannedFun: 'a pickup soccer game that became a Sunday crew',
  meetPeople: 'through friends and a climbing gym',
};

describe('question-key-map resolveAnswer', () => {
  it('resolves every scored stableKey to a non-empty answer', () => {
    const dead: string[] = [];
    for (const key of SCORED_STABLE_KEYS) {
      const resolved = (resolveAnswer(key, FORM_ANSWERS) ?? '').trim();
      if (!resolved) dead.push(key);
    }
    expect(dead, `scored stableKeys resolving to nothing: ${dead.join(', ')}`).toEqual([]);
  });

  it('resolves simple questions by identity (stableKey === form field id)', () => {
    expect(resolveAnswer('comeToYouFor', FORM_ANSWERS)).toBe('introductions');
    expect(resolveAnswer('walkIntoRoom', FORM_ANSWERS)).toBe('I find the person standing alone');
  });

  it('joins the referrals group (first + last) instead of dropping it', () => {
    const resolved = resolveAnswer('referrals', FORM_ANSWERS) ?? '';
    expect(resolved).toContain('Jane');
    expect(resolved).toContain('Doe');
    expect(resolved).toContain('John');
    expect(resolved).toContain('Roe');
  });

  it('skips empty subfields when joining a group answer', () => {
    const resolved = resolveAnswer('referrals', { 'referrals.referral1First': 'Solo' });
    expect(resolved).toBe('Solo');
  });

  it('falls back to identity lookup for template-builder stableKeys', () => {
    const resolved = resolveAnswer('custom_builder_key', { custom_builder_key: 'direct' });
    expect(resolved).toBe('direct');
  });

  it('every bridge target is a real group subfield present in the form', () => {
    // Guards the stale-map regression: a bridge entry pointing at a key the form
    // never writes resolves to nothing. Every referenced key must be present in
    // the representative set, which mirrors app/apply/_lib/questions.ts.
    const referenced = new Set<string>();
    for (const v of Object.values(MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY)) {
      (Array.isArray(v) ? v : [v]).forEach((k) => referenced.add(k));
    }
    const known = new Set(Object.keys(FORM_ANSWERS));
    const dangling = [...referenced].filter((k) => !known.has(k));
    expect(dangling, `bridge targets missing from the form: ${dangling.join(', ')}`).toEqual([]);
  });

  it('only group questions carry a bridge entry; everything else is identity', () => {
    const bridgeKeys = new Set(Object.keys(MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY));
    expect(bridgeKeys).toEqual(GROUP_KEYS);
  });
});

// Sync guard: the seed rubric (scripts/seed-questions.mjs, mirrored by
// SCORED_STABLE_KEYS above) must stay in lockstep with the live form
// (app/apply/_lib/questions.ts). A scored key the form no longer writes silently
// drops out of scoring; a bridge sub-key the form no longer writes resolves to
// nothing. Both are the regressions this block turns into a red test.
describe('scored rubric <-> form question set', () => {
  const formIds = new Set(QUESTIONS.map((q) => q.id));
  const formSubKeys = new Set<string>();
  for (const q of QUESTIONS) {
    for (const sub of q.fields ?? []) formSubKeys.add(`${q.id}.${sub.id}`);
  }

  it('is exactly the 13 scored rubric keys', () => {
    expect(SCORED_STABLE_KEYS).toHaveLength(13);
  });

  it('every simple scored stableKey exists as a live form question id', () => {
    const missing = SCORED_STABLE_KEYS.filter(
      (k) => !GROUP_KEYS.has(k) && !formIds.has(k),
    );
    expect(missing, `scored keys not in the form: ${missing.join(', ')}`).toEqual([]);
  });

  it('every scored GROUP question exists as a form group', () => {
    for (const key of GROUP_KEYS) {
      const q = QUESTIONS.find((x) => x.id === key);
      expect(q, `group question "${key}" missing from the form`).toBeTruthy();
      expect(q?.type).toBe('group');
    }
  });

  it('every referrals bridge sub-key is a real form group sub-field', () => {
    const bridge = MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY['referrals'];
    const keys = Array.isArray(bridge) ? bridge : [bridge];
    const dangling = keys.filter((k) => !formSubKeys.has(k));
    expect(dangling, `referrals bridge sub-keys not in the form: ${dangling.join(', ')}`).toEqual([]);
  });
});
