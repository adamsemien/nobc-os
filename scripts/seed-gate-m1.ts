/**
 * Gate Engine M1 acceptance seed (`tsx scripts/seed-gate-m1.ts`). Thin CLI
 * wrapper over the shared world builder in
 * tests/unit/gate-engine/helpers/seed.ts - the same rows the acceptance suite
 * uses (workspace slug "gate-m1-acceptance"). Idempotent: re-running cleans
 * and re-creates the world. Targets whatever DATABASE_URL in .env.local
 * points at - keep that on the dev branch (ep-sweet-term), never production.
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

  const { seedAcceptanceWorld } = await import(
    "../tests/unit/gate-engine/helpers/seed"
  );
  const world = await seedAcceptanceWorld(db);
  console.log("Gate M1 acceptance world seeded:");
  console.log(`  workspace   ${world.workspace.id} (${world.workspace.slug})`);
  console.log(`  referrer    ${world.referrer.id}`);
  console.log(`  referred    ${world.referredGuest.id}`);
  console.log(`  attendee    ${world.attendee.id} (1 checked-in Access record)`);
  console.log(`  applicant   ${world.applicant.id} (application ${world.applicationId})`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[seed-gate-m1] failed:", err);
  process.exit(1);
});
