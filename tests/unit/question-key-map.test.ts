import { describe, it, expect } from 'vitest';
import { resolveAnswer, MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY } from '@/lib/question-key-map';

// The scored QuestionDefinition stableKeys from scripts/seed-questions.mjs. As of
// the 2026-06-23 scoring-model rebuild, every stableKey === the live form field
// id (app/apply/_lib/questions.ts), so simple questions resolve by identity and
// only the two GROUP questions (referrals, recSources) need a bridge entry.
// The scorer (lib/scoring.ts) calls resolveAnswer(stableKey, answersByKey) for
// each of these; if one stops resolving, that answer silently vanishes from
// scoring - the exact regression this file guards.
const SCORED_STABLE_KEYS = [
  'whatYouDo', 'creativePursuits', 'referrals', 'cities',
  'comeToYouFor', 'expertIn', 'recommendForPay', 'lastConvinced', 'obsessedWith',
  'connectionCreated', 'loyalCommunity', 'goodCompany', 'detailsRight', 'trustedTaste',
  'brandPartner', 'loyalBrands', 'splurgeSave', 'idealSaturday', 'recSources', 'scrollStopping',
  'flowThrough', 'investedIn', 'friendDescribe',
] as const;

// The two scored GROUP questions whose answers live under dotted subfield keys.
const GROUP_KEYS = new Set(['referrals', 'recSources']);

// A representative full answer set, keyed exactly as the live form
// (app/apply/_lib/questions.ts) writes them onto ApplicationAnswer.questionKey:
// bare ids for plain fields, `${groupId}.${subId}` for group fields.
const FORM_ANSWERS: Record<string, string> = {
  whatYouDo: 'I run a design studio',
  creativePursuits: 'ceramics, a zine',
  'referrals.referral1': 'Jane Doe',
  'referrals.referral2': 'John Roe',
  'referrals.referral3': '',
  cities: 'Austin, NYC',
  comeToYouFor: 'introductions',
  expertIn: 'brand strategy for hospitality',
  recommendForPay: 'a specific olive oil',
  lastConvinced: 'a friend to buy a film camera',
  obsessedWith: 'natural wine',
  connectionCreated: 'introduced two cofounders',
  loyalCommunity: 'my run club for 6 years',
  goodCompany: 'people who ask real questions',
  detailsRight: 'a small omakase bar',
  trustedTaste: 'my old creative director',
  brandPartner: 'a regional mezcal brand',
  loyalBrands: 'a boot maker in Texas',
  splurgeSave: 'splurge on travel, save on clothes',
  idealSaturday: 'farmers market then a long ride',
  'recSources.travel': 'a friend who travels constantly',
  'recSources.food': 'a chef newsletter',
  'recSources.healthWellness': 'my trainer',
  'recSources.beauty': 'a specific subreddit',
  'recSources.fashionDesign': 'an archive instagram',
  scrollStopping: 'design process videos on instagram',
  flowThrough: 'founders and artists',
  investedIn: 'a gallery show for a friend',
  friendDescribe: 'the one making introductions',
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
    expect(resolveAnswer('detailsRight', FORM_ANSWERS)).toBe('a small omakase bar');
  });

  it('joins a group question (referrals) instead of dropping it', () => {
    const resolved = resolveAnswer('referrals', FORM_ANSWERS);
    expect(resolved).toContain('Jane Doe');
    expect(resolved).toContain('John Roe');
  });

  it('joins the recSources group across all five categories', () => {
    const resolved = resolveAnswer('recSources', FORM_ANSWERS) ?? '';
    expect(resolved).toContain('a chef newsletter');
    expect(resolved).toContain('an archive instagram');
  });

  it('skips empty subfields when joining a group answer', () => {
    const resolved = resolveAnswer('referrals', { 'referrals.referral1': 'Solo' });
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
