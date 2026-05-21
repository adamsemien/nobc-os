/** Verifies the seeded demo applications are COMPLETE and REVIEWED.
 *
 *  For every demo-tagged Application it checks:
 *    - full answer set: the 4 real questions + food + accessibility + priorEvent
 *      (7 substantive Q&A rows the operator renders) + 2 consents + _photos
 *    - full AI profile: archetype, aiScore, aiRecommendation, aiReasoning, and
 *      archetypeScores on the 0–100 scale with the top score == archetype
 *
 *  Read-only. Run after `npm run seed:demo`:
 *    ./node_modules/.bin/tsx scripts/verify-demo-applications.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DEMO_TAGS = ['__demo', '__demo-tenur', '__demo-pending', '__persona_test'];
const REQUIRED_SUBSTANTIVE = ['workingOn', 'greatEnergy', 'learnedThisYear', 'meetPeople', 'food', 'accessibility', 'priorEvent'];
const REQUIRED_CONSENT = ['consentMembershipRead', 'consentPhotos'];
const ARCHETYPES = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'];

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
    const missingAns = [
      ...REQUIRED_SUBSTANTIVE.filter((k) => !keys.has(k)),
      ...REQUIRED_CONSENT.filter((k) => !keys.has(k)),
    ];
    if (!keys.has('_photos')) missingAns.push('_photos');
    if (missingAns.length === 0) answersOk++;

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

    if (missingAns.length || !aiComplete) {
      const problems: string[] = [];
      if (missingAns.length) problems.push(`missing answers: ${missingAns.join(', ')}`);
      if (!app.archetype) problems.push('no archetype');
      if (app.aiScore == null) problems.push('no aiScore');
      if (!app.aiReasoning) problems.push('no aiReasoning');
      if (!scoresInRange) problems.push('archetypeScores out of 0–100');
      if (top !== app.archetype) problems.push(`top score (${top}) != archetype (${app.archetype})`);
      failures.push(`  ✗ ${app.fullName} [${app.status}] — ${problems.join('; ')}`);
    }
  }

  console.log(`\nDemo applications: ${apps.length}`);
  console.log(`  full answer set:  ${answersOk}/${apps.length}`);
  console.log(`  full AI profile:  ${aiOk}/${apps.length}`);
  if (failures.length) {
    console.log(`\nFAILURES (${failures.length}):`);
    failures.forEach((f) => console.log(f));
  } else {
    console.log('\nAll demo applications are complete and reviewed. ✓');
  }

  // Sample: open three applicants and print what the operator would read.
  console.log('\n── sample applicants ──');
  for (const app of [apps[0], apps[Math.floor(apps.length / 2)], apps[apps.length - 1]].filter(Boolean)) {
    const byKey = Object.fromEntries(app.answers.map((a) => [a.questionKey, a.answer]));
    const scores = app.archetypeScores as Record<string, number>;
    console.log(`\n▸ ${app.fullName} [${app.status}] — ${app.archetype} · AI ${app.aiScore} · ${app.aiRecommendation}`);
    console.log(`  scores: ${ARCHETYPES.map((a) => `${a[0]}${a[1]}:${scores[a]}`).join(' ')}`);
    console.log(`  reasoning: ${app.aiReasoning?.slice(0, 90)}…`);
    console.log(`  answer rows (${app.answers.length}): ${app.answers.map((a) => a.questionKey).join(', ')}`);
    console.log(`  workingOn: ${String(byKey.workingOn ?? '—').slice(0, 80)}`);
    console.log(`  learnedThisYear: ${String(byKey.learnedThisYear ?? '—').slice(0, 80)}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
