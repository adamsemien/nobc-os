/** One-time backfill: archetypeScores 0–1 → 0–100.
 *
 *  Legacy Application rows stored archetypeScores on a 0–1 scale. The seed
 *  and the UI normalizer are now fixed, but the stored rows still hold the
 *  old values. lib/intelligence (worth.ts → worthTotal) and the MCP
 *  applications `get` tool read archetypeScores RAW — they treat each value
 *  as already 0–100 and clamp to that range. A legacy 0–1 row therefore
 *  derives worth ≈ 0 and reads as `waitlist` everywhere downstream.
 *
 *  Fix: for any Application whose archetypeScores values are ALL ≤ 1, rewrite
 *  each value as round(value × 100). The "all ≤ 1" guard is the safe scale
 *  detector — a correctly-scaled 0–100 row has at least one value > 1, so it
 *  is skipped. This also makes the script idempotent: re-running finds no
 *  remaining ≤ 1 rows (corrected values are now > 1, except genuine zeros
 *  which are a no-op).
 *
 *  Dry-run by default — prints every candidate, writes nothing. Pass --write
 *  to persist:
 *    ./node_modules/.bin/tsx scripts/fix-archetype-scores-scale.ts --write
 *
 *  Not wired to any CI/prod hook — run manually after review. NOTE: Producer
 *  shares this Postgres instance; this touches only NoBC OS Application rows. */
import { config } from 'dotenv';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const ARCHETYPES = ['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron'] as const;

type Scores = Record<string, number>;

/** A row is legacy-scaled iff it has ≥1 numeric value and every value ≤ 1. */
function isLegacyScale(scores: unknown): scores is Scores {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return false;
  const values = Object.values(scores as Record<string, unknown>);
  if (values.length === 0) return false;
  return values.every((v) => typeof v === 'number' && Number.isFinite(v) && v <= 1);
}

/** Multiply every value by 100 and round. */
function rescale(scores: Scores): Scores {
  const out: Scores = {};
  for (const [k, v] of Object.entries(scores)) out[k] = Math.round(v * 100);
  return out;
}

function fmt(scores: Scores): string {
  return ARCHETYPES.map((a) => `${a[0]}${a[1]}:${scores[a] ?? '—'}`).join(' ');
}

async function main() {
  const { db } = await import('@/lib/db');

  const apps = await db.application.findMany({
    select: { id: true, workspaceId: true, fullName: true, archetypeScores: true },
  });

  console.log(`\n${WRITE ? '[WRITE]' : '[DRY RUN]'} scanning ${apps.length} application(s)`);
  console.log('Rule: every archetypeScores value ≤ 1 → multiply each by 100, rounded.\n');

  let corrected = 0; // matched the rule AND values actually changed (written when --write)
  let noop = 0; // matched the rule but ×100 was a no-op (all zeros) — left untouched
  let alreadyScaled = 0; // not all ≤ 1 — already 0–100, skipped
  let empty = 0; // null / non-object / no values — skipped

  for (const app of apps) {
    const raw = app.archetypeScores;

    if (!isLegacyScale(raw)) {
      if (!raw || typeof raw !== 'object') empty++;
      else if (Object.values(raw as Record<string, unknown>).length === 0) empty++;
      else alreadyScaled++;
      continue;
    }

    const next = rescale(raw);
    const changed = ARCHETYPES.some((a) => (raw[a] ?? null) !== (next[a] ?? null));

    if (!changed) {
      noop++;
      console.log(`  ∅ ${app.fullName} (${app.id}) — all zeros, no-op`);
      continue;
    }

    console.log(`  ✓ ${app.fullName} (${app.id})`);
    console.log(`      before  ${fmt(raw)}`);
    console.log(`      after   ${fmt(next)}`);

    if (WRITE) {
      await db.application.update({
        where: { id: app.id },
        data: { archetypeScores: next },
      });
    }
    corrected++;
  }

  console.log('\n── summary ──');
  console.log(`  corrected (≤1 → ×100)   ${corrected}${WRITE ? ' [written]' : ' [dry-run]'}`);
  console.log(`  matched but no-op (0s)  ${noop}`);
  console.log(`  already 0–100, skipped  ${alreadyScaled}`);
  console.log(`  null/empty, skipped     ${empty}`);
  console.log(`  total scanned           ${apps.length}`);

  if (!WRITE && corrected > 0) {
    console.log('\nRe-run with --write to persist these corrections.');
  }
  console.log('');

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
