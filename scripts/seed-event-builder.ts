/**
 * Event Builder Rebuild acceptance seed (`tsx scripts/seed-event-builder.ts`).
 * Thin CLI wrapper over tests/unit/helpers/nbs-world.ts - seeds the NBS-shape
 * baseline replica (workspace "event-builder-nbs-baseline") plus a blank
 * builder-acceptance workspace ("event-builder-acceptance"). Idempotent.
 * Targets whatever DATABASE_URL in .env.local points at - keep that on the
 * dev branch (ep-sweet-term), never production.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (expected in .env.local)");
  if (url.includes("ep-twilight-forest")) {
    throw new Error("Refusing to seed: DATABASE_URL points at the production branch.");
  }
  const adapter = new PrismaNeon({ connectionString: url });
  const db = new PrismaClient({ adapter });

  const { seedNbsWorld, seedBuilderWorld } = await import(
    "../tests/unit/helpers/nbs-world"
  );
  const nbs = await seedNbsWorld(db);
  const builder = await seedBuilderWorld(db);
  console.log("Event Builder acceptance worlds seeded:");
  console.log(`  NBS replica workspace  ${nbs.workspace.id} (${nbs.workspace.slug})`);
  console.log(`  NBS replica event      ${nbs.eventId} (/e/${nbs.eventSlug})`);
  console.log(`  builder workspace      ${builder.id} (${builder.slug})`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[seed-event-builder] failed:", err);
  process.exit(1);
});
