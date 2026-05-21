import { APPLY_QUESTIONS } from '@/lib/apply-config';

/**
 * Non-destructive label resolution for ApplicationAnswer.questionKey.
 *
 * The data carries several key generations: the current /apply form's bare
 * camelCase keys (in APPLY_QUESTIONS), an older dotted `section.field` form,
 * and a snake_case seed generator. Rather than rewrite stored rows, we map the
 * legacy keys to human labels here. Display-only — no DB migration.
 */

const CONFIG_LABELS = new Map(APPLY_QUESTIONS.map(q => [q.key, q.label]));

export const LEGACY_ANSWER_LABELS: Record<string, string> = {
  // snake_case (seed generator)
  what_you_do: 'What you do',
  why_nobc: 'Why No Bad Company',
  contribution: 'What you bring',
  passion_projects: 'Passion projects',
  work_website: 'Website',
  where_from: "Where you're from",
  home_address: 'Location',
  if_not_here: 'If not here…',
  karaoke_order: 'Karaoke order',
  sunday_morning: 'Sunday morning',
  birthday: 'Birthday',

  // dotted section.field (older form) — basics
  'basics.whatYouDo': 'What you do',
  'basics.city': 'City',
  'basics.neighborhood': 'Neighborhood',
  'basics.fromOriginally': "Where you're from",
  'basics.birthday': 'Birthday',
  'basics.links': 'Links',
  'basics.homeAddress': 'Location',
  'basics.howDidYouHear': 'How they heard about us',
  'basics.referrers': 'Referred by',

  // about
  'about.whatPeopleComeToYouFor': 'What people come to them for',
  'about.genuineExpertIn': 'Genuinely an expert in',
  'about.heavilyInvestedIn': 'Heavily invested in',

  // personality
  'personality.workingOn': "What they're working on",
  'personality.obsessedWith': 'Obsessed with',
  'personality.personYouAdmire': 'Someone they admire',

  // community
  'community.interestingPeople': 'Most interesting people in their life',
  'community.connectionOpportunity': 'A time they connected two people',
  'community.loyalCommunity': "A community they've stayed loyal to",
  'community.howDoYouKnowGoodCompany': 'How they know good company',
  'community.whatKindOfPeopleFlowThrough': 'What kind of people flow through their life',

  // taste
  'taste.detailsRight': 'A place that gets the details right',
  'taste.trustTaste': 'Whose taste they trust',
  'taste.recommend': 'What they recommend',
  'taste.recommendFashion': 'Fashion recommendation',
  'taste.recommendFoodDrink': 'Food & drink recommendation',
  'taste.recommendHomeDesign': 'Home & design recommendation',
  'taste.recommendTravel': 'Travel recommendation',
  'taste.recommendWellnessFitness': 'Wellness & fitness recommendation',
  'taste.splurgeVsSave': 'Splurge vs save',

  // rapid fire
  'rapid.coffeeTable': 'Coffee table',
  'rapid.contentStopsScrolling': 'Content that stops their scroll',
  'rapid.dreamBrandPartnership': 'Dream brand partnership',
  'rapid.everydayItem': 'Everyday item',
  'rapid.idealSaturday': 'Ideal Saturday',
  'rapid.karaokeS': 'Karaoke go-to',
  'rapid.localAustinBrand': 'Local Austin brand',
  'rapid.preferredWorkout': 'Preferred workout',
  'rapid.shoppingCart': 'In their shopping cart',
  'rapid.spendMoreThanMost': 'What they spend more than most on',
  'rapid.sundayMorning': 'Sunday morning',
  'rapid.topPodcasts': 'Top podcasts',
};

/** snake/dotted/camelCase key → "Sentence case" — last-resort fallback. */
export function prettyAnswerKey(key: string): string {
  const cleaned = key.replace(/^_+/, '').replace(/[._]+/g, ' ').trim();
  if (!cleaned) return key;
  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Resolve a human label across all key generations:
 *  current /apply config → legacy/seed map → prettified key. */
export function resolveAnswerLabel(key: string): string {
  return CONFIG_LABELS.get(key) ?? LEGACY_ANSWER_LABELS[key] ?? prettyAnswerKey(key);
}
