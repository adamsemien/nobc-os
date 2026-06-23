import { describe, it, expect } from 'vitest';
import { resolveAnswer, MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY } from '@/lib/question-key-map';

// The scored QuestionDefinition stableKeys (scoringDimension != null) from
// scripts/seed-questions.mjs. The scorer (lib/scoring.ts) calls
// resolveAnswer(stableKey, answersByKey) for each of these; if one stops
// resolving, that applicant's answer silently vanishes from scoring — the exact
// regression this file guards. Keep in sync with the seed's scored questions.
const SCORED_STABLE_KEYS = [
  'basics_city',
  'basics_referrers',
  'real_working_on',
  'real_obsessed_with',
  'real_called_about',
  'world_interesting_people',
  'world_connected_people',
  'world_community_loyalty',
  'taste_place_details',
  'taste_trust_taste',
  'taste_recommend_paid',
  'taste_splurge_save',
  'rapid_karaoke',
  'rapid_coffee_table',
  'rapid_sunday_morning',
  'rapid_most_dont_know',
] as const;

// Scored questions the rebuilt form has no equivalent field for. The scorer reads
// "no answer provided" for these (acceptable, graceful) — but they must be
// explicit so a future field gets wired up rather than silently lost.
const INTENTIONALLY_UNMAPPED = new Set(['rapid_coffee_table', 'rapid_most_dont_know']);

// A representative full answer set, keyed exactly as the live form
// (app/apply/_lib/questions.ts) writes them onto ApplicationAnswer.questionKey:
// bare ids for plain fields, `${groupId}.${subId}` for group fields.
const FORM_ANSWERS: Record<string, string> = {
  homeAddress: '123 Main St, Austin TX',
  cities: 'Austin, NYC',
  'referrals.referral1': 'Jane Doe',
  'referrals.referral2': 'John Roe',
  'referrals.referral3': '',
  whatYouDo: 'I run a design studio',
  creativePursuits: 'ceramics, a zine',
  obsessedWith: 'natural wine',
  comeToYouFor: 'introductions',
  flowThrough: 'founders and artists',
  connectionCreated: 'introduced two cofounders',
  loyalCommunity: 'my run club for 6 years',
  detailsRight: 'a small omakase bar',
  trustedTaste: 'my old creative director',
  recommendForPay: 'a specific olive oil',
  splurgeSave: 'splurge on travel, save on clothes',
  karaoke: 'Total Eclipse of the Heart',
  idealSaturday: 'farmers market then a long ride',
};

describe('question-key-map resolveAnswer', () => {
  it('resolves every scored stableKey to a non-empty answer (or is intentionally unmapped)', () => {
    const dead: string[] = [];
    for (const key of SCORED_STABLE_KEYS) {
      const resolved = (resolveAnswer(key, FORM_ANSWERS) ?? '').trim();
      if (!resolved && !INTENTIONALLY_UNMAPPED.has(key)) dead.push(key);
    }
    expect(dead, `scored stableKeys resolving to nothing: ${dead.join(', ')}`).toEqual([]);
  });

  it('joins multi-field answers (referrers) instead of dropping them', () => {
    const resolved = resolveAnswer('basics_referrers', FORM_ANSWERS);
    expect(resolved).toContain('Jane Doe');
    expect(resolved).toContain('John Roe');
  });

  it('skips empty fields when joining a multi-field answer', () => {
    const resolved = resolveAnswer('basics_referrers', { 'referrals.referral1': 'Solo' });
    expect(resolved).toBe('Solo');
  });

  it('falls back to identity lookup for template-builder stableKeys', () => {
    // Question-builder templates store answers under the stableKey itself,
    // with no bridge entry.
    const resolved = resolveAnswer('custom_builder_key', { custom_builder_key: 'direct' });
    expect(resolved).toBe('direct');
  });

  it('has no dangling bridge target (every mapped key is a real form field)', () => {
    // Guards the stale-map regression directly: a bridge entry pointing at a form
    // key that no longer exists (e.g. the old `real.workingOn`) resolves to
    // nothing. Every referenced key must be present in the representative set,
    // which mirrors app/apply/_lib/questions.ts.
    const referenced = new Set<string>();
    for (const v of Object.values(MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY)) {
      (Array.isArray(v) ? v : [v]).forEach((k) => referenced.add(k));
    }
    const known = new Set(Object.keys(FORM_ANSWERS));
    const dangling = [...referenced].filter((k) => !known.has(k));
    expect(dangling, `bridge targets missing from the form: ${dangling.join(', ')}`).toEqual([]);
  });
});
