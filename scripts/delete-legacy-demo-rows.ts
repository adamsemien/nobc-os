/** One-shot cleanup: deletes the 5 legacy demo application rows surfaced by
 *  the rescore dry-run (all "Jordan Mercer" demo-persona submissions whose
 *  answers no longer resolve and which rescore to ~0).
 *
 *  Dry-run by default — prints the 5 rows + the total Application count,
 *  deletes nothing. Pass --confirm to delete (ApplicationAnswer rows first,
 *  then Application rows, in one transaction):
 *    ./node_modules/.bin/tsx scripts/delete-legacy-demo-rows.ts --confirm
 *
 *  IDs are hardcoded — this is a one-shot cleanup, not a reusable tool.
 *  Not wired to any CI/prod hook — run manually after review. */
import { config } from 'dotenv';
config({ path: '.env.local' });

const CONFIRM = process.argv.includes('--confirm');

const TARGET_IDS = [
  'cmp8qoctd000004l7web965jq',
  'cmp8p57nm000004jp149dsd6e',
  'cmp9gf9gb000004iecijfguo9',
  'cmp8rkgpl000004js9zn7hu2y',
  'cmp8r3i85000004iezhfepk3v',
];

async function main() {
  const { db } = await import('@/lib/db');

  // Application has no `submittedAt` column — `createdAt` is the submit time.
  const rows = await db.application.findMany({
    where: { id: { in: TARGET_IDS } },
    select: {
      id: true,
      fullName: true,
      email: true,
      createdAt: true,
      aiScore: true,
      _count: { select: { answers: true } },
    },
  });
  const totalApplications = await db.application.count();

  console.log(`\n${CONFIRM ? '[CONFIRM]' : '[DRY RUN]'} legacy demo row cleanup`);
  console.log(`Matched ${rows.length} of ${TARGET_IDS.length} target id(s).`);
  console.table(
    rows.map((r) => ({
      id: r.id,
      name: r.fullName,
      email: r.email,
      submittedAt: r.createdAt.toISOString(),
      aiScore: r.aiScore,
      answers: r._count.answers,
    })),
  );
  console.log(`Total Application rows in DB: ${totalApplications}\n`);

  if (!CONFIRM) {
    console.log('Dry run — nothing deleted. Re-run with --confirm to delete.\n');
    await db.$disconnect();
    return;
  }

  // ApplicationAnswer first (FK is Restrict), then Application — one transaction.
  const [answersDeleted, appsDeleted] = await db.$transaction([
    db.applicationAnswer.deleteMany({ where: { applicationId: { in: TARGET_IDS } } }),
    db.application.deleteMany({ where: { id: { in: TARGET_IDS } } }),
  ]);
  console.log(`Deleted ${answersDeleted.count} ApplicationAnswer row(s).`);
  console.log(`Deleted ${appsDeleted.count} Application row(s).`);

  // Verify-empty: same query the rescore script uses.
  const legacyRemaining = await db.application.count({ where: { aiScore: { gt: 1 } } });
  console.log(`\nApplication rows with aiScore > 1 remaining: ${legacyRemaining}\n`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
