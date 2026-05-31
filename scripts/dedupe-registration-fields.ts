/**
 * Dedupe EventCustomQuestion rows (UI: "Registration fields").
 *
 * Real table is PascalCase "EventCustomQuestion" (no @@map). schema.prisma has
 * drifted from the live DB; this script uses raw SQL against the real columns and
 * does NOT touch schema.prisma.
 *
 * "Audience" is modeled as the (showToMember, showToGuest) boolean pair — there is
 * no `audience` column. Two rows are duplicates when they share the same
 * (eventId, label, showToMember, showToGuest). Within each group we keep the most
 * recently updated row (updatedAt DESC, id DESC tiebreaker); the rest are deleted.
 *
 * SAFE BY DEFAULT: no flag = DRY RUN (count + write snapshot, delete nothing).
 *   npx tsx scripts/dedupe-registration-fields.ts            # dry run
 *   npx tsx scripts/dedupe-registration-fields.ts --apply    # perform deletes
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const APPLY = process.argv.includes('--apply');
const SNAPSHOT = '_context/_audit/dedupe-snapshot-event_custom_questions.json';
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [counts] = await prisma.$queryRaw<
    { rows_to_delete: bigint; total_rows: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE rn > 1) AS rows_to_delete,
      COUNT(*)                       AS total_rows
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY "eventId", label, "showToMember", "showToGuest"
          ORDER BY "updatedAt" DESC, id DESC
        ) AS rn
      FROM "EventCustomQuestion"
    ) s
  `;

  const [groups] = await prisma.$queryRaw<{ dup_groups: bigint }[]>`
    SELECT COUNT(*) AS dup_groups FROM (
      SELECT 1 FROM "EventCustomQuestion"
      GROUP BY "eventId", label, "showToMember", "showToGuest"
      HAVING COUNT(*) > 1
    ) g
  `;

  const sample = await prisma.$queryRaw<
    { eventId: string; label: string; showToMember: boolean; showToGuest: boolean; cnt: bigint }[]
  >`
    SELECT "eventId", label, "showToMember", "showToGuest", COUNT(*) AS cnt
    FROM "EventCustomQuestion"
    GROUP BY "eventId", label, "showToMember", "showToGuest"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `;

  const rowsToDelete = Number(counts.rows_to_delete);
  const totalRows = Number(counts.total_rows);
  const dupGroups = Number(groups.dup_groups);

  console.log('===== EventCustomQuestion dedupe — ' + (APPLY ? 'APPLY' : 'DRY RUN') + ' =====');
  console.log('Total rows in table:        ', totalRows);
  console.log('Duplicate groups:           ', dupGroups);
  console.log('Rows that WOULD be deleted: ', rowsToDelete, '(keeping newest per group)');
  console.log('');
  console.log('Affected groups (eventId | member? | guest? | count | label):');
  for (const g of sample) {
    console.log(`  ${g.eventId} | ${g.showToMember ? 'Y' : 'N'} | ${g.showToGuest ? 'Y' : 'N'} | ${Number(g.cnt)} | ${JSON.stringify(g.label)}`);
  }
  if (dupGroups > sample.length) console.log(`  ... and ${dupGroups - sample.length} more groups`);

  // Rollback snapshot: full rows that would be deleted (rn > 1), all columns.
  const doomed = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT t.* FROM "EventCustomQuestion" t
    JOIN (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY "eventId", label, "showToMember", "showToGuest"
          ORDER BY "updatedAt" DESC, id DESC
        ) AS rn
      FROM "EventCustomQuestion"
    ) d ON d.id = t.id
    WHERE d.rn > 1
    ORDER BY t."eventId", t.label, t."showToMember", t."showToGuest", t."updatedAt" DESC
  `;
  writeFileSync(SNAPSHOT, JSON.stringify(doomed, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  console.log('');
  console.log(`Snapshot of ${doomed.length} to-be-deleted row(s) written to: ${SNAPSHOT}`);
  console.log(`CONSISTENCY: snapshot_rows=${doomed.length} rows_to_delete=${rowsToDelete} match=${doomed.length === rowsToDelete}`);

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — no rows deleted. Re-run with --apply to delete.');
    return;
  }

  const deleted = await prisma.$executeRaw`
    DELETE FROM "EventCustomQuestion" t
    USING (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY "eventId", label, "showToMember", "showToGuest"
          ORDER BY "updatedAt" DESC, id DESC
        ) AS rn
      FROM "EventCustomQuestion"
    ) d
    WHERE t.id = d.id AND d.rn > 1
  `;
  console.log('');
  console.log(`APPLIED — deleted ${deleted} duplicate row(s).`);
}

main()
  .catch((e) => { console.error('ERR', e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
