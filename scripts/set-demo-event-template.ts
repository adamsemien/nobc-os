/**
 * One-off demo utility: point the seeded demo events at a member-page template.
 *
 * The seed (prisma/seed-demo.ts) now creates demo events with `template: 'split'`,
 * but events that were already seeded keep whatever template they had. This syncs
 * the existing rows so the redesigned Split layout is what you see.
 *
 * Scoped to the demo workspace ("No Bad Company", or SEED_WORKSPACE_ID) and the
 * four seeded slugs only — it never touches a non-demo event. Reversible:
 *
 *   npx tsx scripts/set-demo-event-template.ts            # → split (default)
 *   npx tsx scripts/set-demo-event-template.ts editorial  # → revert
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DEMO_SLUGS = [
  'tenur-no-bad-friday-spring',
  'tenur-sunday-selects',
  'tenur-no-bad-friday-next',
  'tenur-founding-night',
];

async function main() {
  const template = process.argv[2] ?? 'split';
  if (!['split', 'editorial', 'minimal'].includes(template)) {
    throw new Error(`Unknown template "${template}" (split | editorial | minimal).`);
  }

  const workspace = process.env.SEED_WORKSPACE_ID
    ? await db.workspace.findUnique({ where: { id: process.env.SEED_WORKSPACE_ID } })
    : await db.workspace.findFirst({ where: { name: 'No Bad Company' } });
  if (!workspace) throw new Error('No "No Bad Company" workspace found. Set SEED_WORKSPACE_ID.');

  const result = await db.event.updateMany({
    where: { workspaceId: workspace.id, slug: { in: DEMO_SLUGS } },
    data: { template },
  });

  console.log(`Set template="${template}" on ${result.count} demo event(s) in "${workspace.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
