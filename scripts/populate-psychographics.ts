/** One-time additive populate: mirror Application.archetype* onto MemberPsychographics.
 *
 *  WHY: archetype is psychographic data. It is computed on Application (by the locked
 *  scoring system in config/archetypes.ts) but the sponsor firewall requires it to live
 *  in the separate, operator-only MemberPsychographics table (member-intelligence PR2).
 *  This script copies the archetype + archetypeScores from each applicant's most recent
 *  scored Application onto their linked Member's psychographics row.
 *
 *  IT DOES NOT touch config/archetypes.ts or the scoring system. Archetype keeps living
 *  on Application; this only mirrors it onto the firewalled table.
 *
 *  SAFETY:
 *   - Creates ONLY where a MemberPsychographics row does NOT already exist (skips
 *     members already populated) — additive + idempotent on re-run, never clobbers.
 *   - Workspace-scoped: workspaceId is carried from the source Application.
 *   - Requires Application.memberId (the PR1 identity link); unlinked apps are skipped.
 *   - Dry-run prints counts and writes NOTHING.
 *
 *    Dry run:  ./node_modules/.bin/tsx scripts/populate-psychographics.ts --dry-run
 *    Execute:  ./node_modules/.bin/tsx scripts/populate-psychographics.ts
 */
import type { Prisma } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const { db } = await import('@/lib/db');
  const { Prisma } = await import('@prisma/client');

  console.log(
    DRY_RUN
      ? '--- DRY RUN (no changes) — omit --dry-run to execute ---\n'
      : '*** WRITE MODE — MemberPsychographics rows will be created ***\n',
  );

  // Most-recent-first so the first row seen per member is their latest scoring.
  const apps = await db.application.findMany({
    where: {
      memberId: { not: null },
      OR: [{ archetype: { not: null } }, { archetypeScores: { not: Prisma.DbNull } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { workspaceId: true, memberId: true, archetype: true, archetypeScores: true },
  });

  // One source application per member (the latest scored one).
  const byMember = new Map<string, (typeof apps)[number]>();
  for (const a of apps) {
    if (a.memberId && !byMember.has(a.memberId)) byMember.set(a.memberId, a);
  }

  // Skip members that already have a psychographics row (idempotent / non-clobbering).
  const existing = await db.memberPsychographics.findMany({
    where: { memberId: { in: [...byMember.keys()] } },
    select: { memberId: true },
  });
  const have = new Set(existing.map((e) => e.memberId));

  const toCreate = [...byMember.values()].filter((a) => a.memberId && !have.has(a.memberId));

  console.log(`scored applications with a linked member : ${byMember.size}`);
  console.log(`already populated (skipped)              : ${have.size}`);
  console.log(`to create                                : ${toCreate.length}\n`);

  if (DRY_RUN || toCreate.length === 0) {
    console.log(DRY_RUN ? 'Dry run complete — nothing written.' : 'Nothing to do.');
    await db.$disconnect();
    return;
  }

  let created = 0;
  for (const a of toCreate) {
    await db.memberPsychographics.create({
      data: {
        workspaceId: a.workspaceId,
        memberId: a.memberId!,
        archetype: a.archetype ?? null,
        ...(a.archetypeScores != null
          ? { archetypeScores: a.archetypeScores as Prisma.InputJsonValue }
          : {}),
      },
    });
    created++;
  }

  console.log(`\nDone. Created ${created} MemberPsychographics row(s).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
