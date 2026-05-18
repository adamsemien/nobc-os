/** Manual E2E test for the AI Insight Composer.
 *  Run: ./node_modules/.bin/tsx scripts/test-composer.ts
 *  Calls composeInsight() directly (bypasses the Clerk-auth'd HTTP route). */
import { config } from 'dotenv';
config({ path: '.env.local' });

const QUESTIONS = [
  "what's the strongest sponsor signal right now?",
  'is the curation bar slipping?',
  "who should we invite to chloe's game?",
  'where do applicants drop off?',
  'which community is going quiet?',
];

async function main() {
  const { db } = await import('@/lib/db');
  await import('@/lib/intelligence'); // side-effect: register every metric
  const { listMetrics, getMetric } = await import('@/lib/intelligence/registry');
  const { composeInsight } = await import('@/lib/intelligence/composer');

  const registered = listMetrics().map((m) => m.id);
  console.log(`ANTHROPIC_API_KEY present: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
  console.log(`Registered metrics (${registered.length}): ${registered.join(', ')}\n`);

  const ws = await db.workspace.findUnique({ where: { slug: 'nobc' } });
  if (!ws) {
    console.error("No workspace with slug 'nobc' — cannot run.");
    process.exit(1);
  }
  console.log(`Workspace: ${ws.name} (${ws.id})\n${'='.repeat(72)}\n`);

  for (const q of QUESTIONS) {
    console.log(`Q: ${q}`);
    try {
      const c = await composeInsight(q, { workspaceId: ws.id });
      const invented = c.metricIds.filter((id) => !getMetric(id));
      console.log(`  metricIds (${c.metricIds.length}): ${c.metricIds.join(', ') || '(none)'}`);
      console.log(`  invented (not in registry): ${invented.length ? invented.join(', ') : 'none'}`);
      console.log(`  tiles rendered: ${c.tiles.length}`);
      console.log(`  narrative: ${c.narrative}`);
      const inRange = c.metricIds.length >= 2 && c.metricIds.length <= 4;
      console.log(`  PASS: ${invented.length === 0 && inRange && c.narrative.length > 0}`);
    } catch (e) {
      console.error(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log('-'.repeat(72));
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
