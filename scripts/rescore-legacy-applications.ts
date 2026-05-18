/** Rescores legacy applications onto the canonical 0–1 aiScore scale.
 *
 *  A handful of applications carry old-scale scores (e.g. 45, 88) — never
 *  re-scored after the canonical scale was fixed at 0–1. This re-runs the
 *  scorer on each and rewrites the scoring fields.
 *
 *  SCALE NOTE: scoreApplication() returns `memberWorthTotal` on a 0–100
 *  scale (see lib/scoring.ts prompt). Canonical `aiScore` is 0–1, so the
 *  value written is `memberWorthTotal / 100`. Without this divide the
 *  script would re-create the very legacy bug it exists to fix.
 *
 *  Dry-run by default — prints a full before/after breakdown, writes
 *  nothing. Pass --write to persist:
 *    ./node_modules/.bin/tsx scripts/rescore-legacy-applications.ts --write
 *
 *  Not wired to any CI/prod hook — run manually after review. */
import { config } from 'dotenv';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const ARCHETYPES = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'] as const;

// Tier cutoffs — identical to lib/agent/tools/applications/find.ts.
const CHARTER_MIN = 22 / 30; // ≈0.73
const STANDARD_MIN = 16 / 30; // ≈0.53

/** memberWorthTotal (0–100) → canonical aiScore (0–1), 2dp. */
function toCanonical(memberWorthTotal: number): number {
  return Math.round((memberWorthTotal / 100) * 100) / 100;
}

/** Any stored aiScore > 1 is legacy 0–100 data — read it as /100. */
function asCanonical(stored: number | null): number | null {
  if (stored == null) return null;
  return stored > 1 ? stored / 100 : stored;
}

function tierOf(score01: number | null): string {
  if (score01 == null) return 'waitlist';
  if (score01 >= CHARTER_MIN) return 'charter';
  if (score01 >= STANDARD_MIN) return 'standard';
  return 'waitlist';
}

async function main() {
  const { db } = await import('@/lib/db');
  const { scoreApplication } = await import('@/lib/scoring');

  // aiScore > 1 is the safe legacy selector — canonical scores are 0–1.
  const legacy = await db.application.findMany({
    where: { aiScore: { gt: 1 } },
    select: { id: true, fullName: true, aiScore: true, archetype: true },
  });

  console.log(
    `\n${WRITE ? '[WRITE]' : '[DRY RUN]'} ${legacy.length} legacy application(s) with aiScore > 1`,
  );
  console.log('Scale: memberWorthTotal is 0–100 → aiScore written as /100 (0–1).');
  console.log('Tiers: charter ≥0.73, standard ≥0.53, else waitlist.\n');

  for (const app of legacy) {
    console.log(`━━ ${app.fullName} (${app.id})`);
    try {
      const result = await scoreApplication(app.id);
      const next = toCanonical(result.memberWorthTotal);
      const before = asCanonical(app.aiScore);
      const beforeTier = tierOf(before);
      const nextTier = tierOf(next);

      console.log(
        `   aiScore     ${String(before).padEnd(6)} → ${next}` +
          `   (DB stores ${app.aiScore} raw · rescored memberWorthTotal ${result.memberWorthTotal})`,
      );
      console.log(
        `   tier        ${beforeTier.padEnd(6)} → ${nextTier}   ` +
          `[${beforeTier === nextTier ? 'unchanged' : 'CHANGED'}]`,
      );
      console.log(`   archetype   ${(app.archetype ?? '—').padEnd(6)} → ${result.archetype}`);
      console.log(`   recommend   ${result.aiRecommendation}`);
      console.log('   archetype breakdown (0–100):');
      for (const a of ARCHETYPES) {
        const score = result.archetypeScores[a];
        const mark = a === result.archetype ? ' ◀ top' : '';
        console.log(`     ${a.padEnd(10)} ${String(score).padStart(3)}${mark}`);
      }
      const d = result.dimensionScores;
      console.log(
        `   dimensions  influence ${d.influence}  contribution ${d.contribution}` +
          `  activation ${d.activation}  taste ${d.taste}`,
      );
      console.log(`   tags        ${result.tags.join(', ') || '—'}`);

      if (WRITE) {
        await db.application.update({
          where: { id: app.id },
          data: {
            aiScore: next,
            archetype: result.archetype,
            archetypeScores: result.archetypeScores,
            aiTags: result.tags,
            aiRecommendation: result.aiRecommendation,
            aiReasoning: result.aiReasoning,
          },
        });
        console.log('   → [written]\n');
      } else {
        console.log('   → [dry-run — not written]\n');
      }
    } catch (e) {
      console.log(`   FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  if (!WRITE && legacy.length > 0) {
    console.log('Re-run with --write to persist these scores.\n');
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
