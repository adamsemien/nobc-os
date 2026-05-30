/**
 * Dev seed for the DAM (`npm run seed:dam`). Thin CLI wrapper over the shared,
 * import-safe core in `lib/dam/seed.ts` (also used by `POST /api/dev/seed-dam`).
 * This file only resolves the target workspace by slug, opens its own Prisma
 * connection, and streams progress — all seeding logic lives in the module.
 *
 * AI tagging is SKIPPED by default. Pass --with-tags to run the real
 * lib/dam/tagging pipeline (no-op unless CLOUDFLARE_* is set).
 *
 * NOTE: the nobc workspace lives in the Producer-shared Neon DB + the shared R2
 * bucket. This writes namespaced dev demo content (uploadedBy = 'dam-seed')
 * into it; the sentinel keeps it fully removable on the next run.
 *
 * Env (loaded from .env.local): PEXELS_API_KEY (required), DATABASE_URL, and the
 * R2_* credentials. Optional: DAM_SEED_WORKSPACE_SLUG (default 'nobc').
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { seedDam } from '../lib/dam/seed';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const WORKSPACE_SLUG = process.env.DAM_SEED_WORKSPACE_SLUG ?? 'nobc';
const WITH_TAGS = process.argv.includes('--with-tags');

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[seed:dam] DATABASE_URL is missing — add it to .env.local.');
    process.exit(1);
  }

  const ws = await db.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
  if (!ws) {
    console.error(`[seed:dam] workspace slug "${WORKSPACE_SLUG}" not found.`);
    process.exit(1);
  }
  console.log(`[seed:dam] workspace=${ws.slug} withTags=${WITH_TAGS}`);

  const result = await seedDam(db, ws.id, {
    withTags: WITH_TAGS,
    log: (line) => console.log(`[seed:dam] ${line}`),
  });

  console.log(
    `[seed:dam] done — ${result.photoCount} photos + ${result.videoCount} videos across 2 folders (${result.totalBytes} bytes). Open /operator/media.`,
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error('[seed:dam] fatal:', e);
    await db.$disconnect();
    process.exit(1);
  });
