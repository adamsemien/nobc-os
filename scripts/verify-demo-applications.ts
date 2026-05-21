/** Verifies the seeded demo applications are COMPLETE and REVIEWED — and shaped
 *  EXACTLY like a genuine /apply submission.
 *
 *  For every demo-tagged Application it checks:
 *    - full live-form answer set: every key MembershipForm.tsx writes
 *      (basics.* / personality.* / community.* / taste.* / rapid.* / about.* /
 *      photos.*), keyed with the real dotted keys — NOT apply-config bare keys.
 *      basics.referrers is optional (blank for un-referred applicants).
 *    - photos.urls is a valid JSON array of http(s) URLs (renders as a strip).
 *    - NO fabricated keys: no apply-config keys (workingOn, greatEnergy, …),
 *      no consent answer rows (consents are model fields), no `_photos`.
 *    - full AI profile: archetype, aiScore, aiRecommendation, aiReasoning, and
 *      archetypeScores on the 0–100 scale with the top score == archetype.
 *
 *  Read-only. Run after `npm run seed:demo`:
 *    ./node_modules/.bin/tsx scripts/verify-demo-applications.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_TAGS = ['__demo', '__demo-tenur', '__demo-pending', '__persona_test'];

// Every live-form key except the optional basics.referrers.
const REQUIRED_KEYS = [
  'basics.city', 'basics.neighborhood', 'basics.homeAddress', 'basics.fromOriginally',
  'basics.birthday', 'basics.links', 'basics.whatYouDo', 'basics.howDidYouHear',
  'personality.workingOn', 'personality.obsessedWith', 'personality.personYouAdmire',
  'community.howDoYouKnowGoodCompany', 'community.connectionOpportunity',
  'community.loyalCommunity', 'community.whatKindOfPeopleFlowThrough', 'community.interestingPeople',
  'taste.detailsRight', 'taste.trustTaste', 'taste.recommend', 'taste.splurgeVsSave',
  'taste.recommendTravel', 'taste.recommendFoodDrink', 'taste.recommendWellnessFitness',
  'taste.recommendFashion', 'taste.recommendHomeDesign',
  'rapid.karaokeS', 'rapid.coffeeTable', 'rapid.idealSaturday', 'rapid.sundayMorning',
  'rapid.contentStopsScrolling', 'rapid.everydayItem', 'rapid.preferredWorkout',
  'rapid.localAustinBrand', 'rapid.dreamBrandPartnership', 'rapid.shoppingCart',
  'rapid.spendMoreThanMost', 'rapid.topPodcasts',
  'about.whatPeopleComeToYouFor', 'about.heavilyInvestedIn', 'about.genuineExpertIn',
  'photos.urls', 'photos.foodAccessibility',
];

// Keys that must NOT appear — the old apply-config / synthetic schema.
const FORBIDDEN_KEYS = [
  'workingOn', 'greatEnergy', 'learnedThisYear', 'meetPeople', 'food', 'accessibility',
  'priorEvent', 'consentMembershipRead', 'consentPhotos', '_photos',
];

const ARCHETYPES = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'];

function validPhotos(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.some((v) => typeof v === 'string' && /^https?:\/\//.test(v));
  } catch {
    return false;
  }
}

async function main() {
  const { db } = await import('@/lib/db');

  const apps = await db.application.findMany({
    where: { aiTags: { hasSome: DEMO_TAGS } },
    include: { answers: true },
    orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
  });

  let answersOk = 0;
  let aiOk = 0;
  const failures: string[] = [];

  for (const app of apps) {
    const keys = new Set(app.answers.map((a) => a.questionKey));
    const byKey = Object.fromEntries(app.answers.map((a) => [a.questionKey, a.answer]));

    const missing = REQUIRED_KEYS.filter((k) => !keys.has(k));
    const forbidden = FORBIDDEN_KEYS.filter((k) => keys.has(k));
    const photosOk = validPhotos(byKey['photos.urls']);
    const answersComplete = missing.length === 0 && forbidden.length === 0 && photosOk;
    if (answersComplete) answersOk++;

    const scores = (app.archetypeScores ?? {}) as Record<string, number>;
    const scoreVals = ARCHETYPES.map((a) => scores[a]);
    const scoresInRange = scoreVals.every((v) => typeof v === 'number' && v >= 0 && v <= 100);
    const top = ARCHETYPES.reduce((best, a) => (scores[a] > (scores[best] ?? -1) ? a : best), ARCHETYPES[0]);
    const aiComplete =
      app.archetype != null &&
      app.aiScore != null &&
      app.aiRecommendation != null &&
      !!app.aiReasoning &&
      scoresInRange &&
      top === app.archetype;
    if (aiComplete) aiOk++;

    if (!answersComplete || !aiComplete) {
      const problems: string[] = [];
      if (missing.length) problems.push(`missing keys: ${missing.join(', ')}`);
      if (forbidden.length) problems.push(`forbidden keys present: ${forbidden.join(', ')}`);
      if (!photosOk) problems.push('photos.urls missing/invalid');
      if (!app.archetype) problems.push('no archetype');
      if (app.aiScore == null) problems.push('no aiScore');
      if (!app.aiReasoning) problems.push('no aiReasoning');
      if (!scoresInRange) problems.push('archetypeScores out of 0–100');
      if (top !== app.archetype) problems.push(`top score (${top}) != archetype (${app.archetype})`);
      failures.push(`  ✗ ${app.fullName} [${app.status}] — ${problems.join('; ')}`);
    }
  }

  console.log(`\nDemo applications: ${apps.length}`);
  console.log(`  full answer set (live-form keys): ${answersOk}/${apps.length}`);
  console.log(`  full AI profile:                  ${aiOk}/${apps.length}`);
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    failures.forEach((f) => console.log(f));
  } else {
    console.log('\nAll demo applications are complete, reviewed, and shaped like genuine /apply submissions. ✓');
  }

  // Sample: open three applicants and print what the operator would read.
  console.log('\n── sample applicants ──');
  for (const app of [apps[0], apps[Math.floor(apps.length / 2)], apps[apps.length - 1]].filter(Boolean)) {
    const byKey = Object.fromEntries(app.answers.map((a) => [a.questionKey, a.answer]));
    const scores = app.archetypeScores as Record<string, number>;
    console.log(`\n▸ ${app.fullName} [${app.status}] — ${app.archetype} · AI ${app.aiScore} · ${app.aiRecommendation}`);
    console.log(`  scores: ${ARCHETYPES.map((a) => `${a[0]}${a[1]}:${scores?.[a]}`).join(' ')}`);
    console.log(`  reasoning: ${app.aiReasoning?.slice(0, 90)}…`);
    console.log(`  answer rows: ${app.answers.length}`);
    console.log(`  basics.whatYouDo: ${String(byKey['basics.whatYouDo'] ?? '—').slice(0, 80)}`);
    console.log(`  personality.workingOn: ${String(byKey['personality.workingOn'] ?? '—').slice(0, 80)}`);
    console.log(`  basics.referrers: ${String(byKey['basics.referrers'] ?? '—')}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
