/** Screenshot world for the Event Builder Rebuild report (Decision 7).
 *  Seeds one PUBLISHED gated event + one DRAFT twin on the dev branch and
 *  prints their ids/slugs for the shot script. Idempotent. Dev-only. */
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SLUG = "event-builder-screenshots";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.includes("ep-twilight-forest")) {
    throw new Error("Refusing to seed: production DATABASE_URL.");
  }
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

  const { cleanupWorld } = await import("../tests/unit/helpers/nbs-world");
  await cleanupWorld(db, SLUG);
  const workspace = await db.workspace.create({
    data: {
      clerkOrgId: `org_${SLUG.replace(/-/g, "_")}`,
      name: "Screenshot world",
      slug: SLUG,
    },
  });

  const base: Omit<Prisma.EventUncheckedCreateInput, "slug" | "title" | "status"> = {
    workspaceId: workspace.id,
    description:
      "An evening of records, conversation, and a table that keeps filling itself. Doors at eight - the address arrives once you are on the list.",
    startAt: new Date("2026-07-12T01:00:00.000Z"),
    location: "The Back Room, Austin",
    capacity: 60,
    showCapacity: true,
    template: "split",
  };

  const published = await db.event.create({
    data: {
      ...base,
      slug: "an-evening-at-the-back-room",
      title: "No Bad Saturday - The Back Room",
      status: "PUBLISHED",
    },
    select: { id: true, slug: true },
  });
  const draft = await db.event.create({
    data: {
      ...base,
      slug: "an-evening-at-the-back-room-draft",
      title: "No Bad Saturday - The Back Room",
      status: "DRAFT",
    },
    select: { id: true, slug: true },
  });

  const { getGateEngine } = await import("../lib/gate-engine");
  for (const eventId of [published.id, draft.id]) {
    await getGateEngine().createGate({
      workspaceId: workspace.id,
      resource: { type: "EVENT", id: eventId },
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [
          {
            kind: "GROUP",
            rule: "ANY_N",
            requiredCount: 1,
            children: [
              { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} },
              { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } },
            ],
          },
        ],
      },
    });
  }

  console.log(
    JSON.stringify({
      workspaceId: workspace.id,
      publishedSlug: published.slug,
      publishedId: published.id,
      draftId: draft.id,
    }),
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[seed-screenshot-world] failed:", err);
  process.exit(1);
});
