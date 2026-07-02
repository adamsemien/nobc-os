/** Phase C - the DRAFT-visibility fix (audit item h), on real rows
 *  (env-gated: GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  getEventBySlug hides DRAFT events by default (the member surface can no
 *  longer browse unpublished events); the preview/loader path opts in with
 *  includeDraft.
 */
import "./gate-engine/helpers/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { cleanupWorld, seedNbsWorld, type NbsWorld } from "./helpers/nbs-world";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;
const SLUG = "event-builder-draft-guard-dbtest";

describeDb("getEventBySlug DRAFT guard", () => {
  let db: PrismaClient;
  let world: NbsWorld;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL missing (.env.local)");
    if (url.includes("ep-twilight-forest")) {
      throw new Error("Refusing to run: DATABASE_URL points at production.");
    }
    db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
    world = await seedNbsWorld(db, SLUG, `${SLUG}-event`);
    await db.event.update({ where: { id: world.eventId }, data: { status: "DRAFT" } });
  }, T);

  afterAll(async () => {
    if (db) {
      await cleanupWorld(db, SLUG);
      await db.$disconnect();
    }
  }, T);

  it(
    "hides a DRAFT by default and reveals it only with includeDraft",
    async () => {
      const { getEventBySlug } = await import("@/lib/events");
      expect(await getEventBySlug(world.workspace.id, world.eventSlug)).toBeNull();
      const withOptIn = await getEventBySlug(world.workspace.id, world.eventSlug, {
        includeDraft: true,
      });
      expect(withOptIn?.id).toBe(world.eventId);
    },
    T,
  );

  it(
    "a PUBLISHED event resolves either way",
    async () => {
      const { getEventBySlug } = await import("@/lib/events");
      await db.event.update({
        where: { id: world.eventId },
        data: { status: "PUBLISHED" },
      });
      try {
        expect(
          (await getEventBySlug(world.workspace.id, world.eventSlug))?.id,
        ).toBe(world.eventId);
      } finally {
        await db.event.update({
          where: { id: world.eventId },
          data: { status: "DRAFT" },
        });
      }
    },
    T,
  );
});
