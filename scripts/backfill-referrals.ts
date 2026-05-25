/** One-time backfill: link members to their referrer via Application.referredBy.
 *
 *  WHY: Application.referredBy is a free-text name ("Jane Doe") captured at apply
 *  time. The new Member.referredByMemberId is the structured link that powers
 *  network-capital scoring (lib/network-capital.ts). This script resolves the
 *  free-text name to an actual Member (same workspace, case-insensitive full-name
 *  match) and writes the link onto the applicant's OWN Member row.
 *
 *  SAFETY:
 *   - Writes ONLY Member.referredByMemberId, ONLY where it IS NULL (guarded
 *     updateMany) — never clobbers an existing/manual link, idempotent on re-run.
 *   - Workspace-scoped: a referrer is only matched within the application's own
 *     workspace.
 *   - Skips self-matches (applicant resolves to their own row) and ambiguous
 *     names (two+ members share the name) rather than guessing.
 *   - Dry-run prints counts and writes NOTHING.
 *
 *    Dry run:  ./node_modules/.bin/tsx scripts/backfill-referrals.ts --dry-run
 *    Execute:  ./node_modules/.bin/tsx scripts/backfill-referrals.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  const { db } = await import('@/lib/db');

  console.log(
    DRY_RUN
      ? '--- DRY RUN (no changes) — omit --dry-run to execute ---\n'
      : '*** WRITE MODE — null Member.referredByMemberId rows will be linked ***\n',
  );

  // Applications that name a referrer AND have a linked member to write onto.
  const apps = await db.application.findMany({
    where: { referredBy: { not: null }, memberId: { not: null } },
    select: { id: true, workspaceId: true, referredBy: true, memberId: true },
  });
  const candidates = apps.filter((a) => (a.referredBy ?? '').trim().length > 0);

  let matched = 0;
  let alreadyLinked = 0;
  let unmatched = 0; // no member with that name in the workspace
  let ambiguous = 0; // multiple members share the name
  let selfMatch = 0; // referrer name resolves to the applicant's own row

  // Per-workspace index: normalized "first last" -> memberId[]. Built lazily.
  const indexByWorkspace = new Map<string, Map<string, string[]>>();

  async function getNameIndex(workspaceId: string): Promise<Map<string, string[]>> {
    const cached = indexByWorkspace.get(workspaceId);
    if (cached) return cached;
    const members = await db.member.findMany({
      where: { workspaceId },
      select: { id: true, firstName: true, lastName: true },
    });
    const idx = new Map<string, string[]>();
    for (const m of members) {
      const key = normalizeName(`${m.firstName} ${m.lastName}`);
      if (!key) continue;
      const arr = idx.get(key) ?? [];
      arr.push(m.id);
      idx.set(key, arr);
    }
    indexByWorkspace.set(workspaceId, idx);
    return idx;
  }

  for (const app of candidates) {
    const idx = await getNameIndex(app.workspaceId);
    const hits = idx.get(normalizeName(app.referredBy!)) ?? [];

    if (hits.length === 0) {
      unmatched++;
      continue;
    }
    if (hits.length > 1) {
      ambiguous++;
      continue;
    }

    const referrerId = hits[0];
    if (referrerId === app.memberId) {
      selfMatch++;
      continue;
    }

    if (DRY_RUN) {
      matched++;
      continue;
    }

    // Guarded write: only links a still-null row. Idempotent, never clobbers.
    const res = await db.member.updateMany({
      where: { id: app.memberId!, referredByMemberId: null },
      data: { referredByMemberId: referrerId },
    });
    if (res.count > 0) matched++;
    else alreadyLinked++;
  }

  console.log(`Applications with a referredBy name + linked member: ${candidates.length}\n`);
  console.log(`  matched + linked:                          ${matched}`);
  console.log(`  already linked (skipped):                  ${alreadyLinked}`);
  console.log(`  unmatched (no member by that name):        ${unmatched}`);
  console.log(`  ambiguous (multiple members share name):   ${ambiguous}`);
  console.log(`  self-match (skipped):                      ${selfMatch}`);
  if (DRY_RUN) {
    console.log('\nDRY RUN complete — nothing written. Re-run without --dry-run to execute.');
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
