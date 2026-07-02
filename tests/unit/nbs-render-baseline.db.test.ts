/** Phase 0 baseline (DB layer) - pins the full public assembly path
 *  (resolvePublishedEventBySlug -> assemblePublicEventDTO) against a real
 *  NBS-shape replica row on the confirmed dev branch. Acceptance 8 partner
 *  to nbs-render-baseline.test.ts.
 *
 *  Env-gated like the gate-engine acceptance suites: GATE_M1_DB_TESTS=1.
 *  Never touches the production branch - the world builder seeds its own
 *  workspace and cleans up after itself.
 */
import "./gate-engine/helpers/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  NBS_REPLICA_EVENT_SLUG,
  cleanupWorld,
  seedNbsWorld,
  type NbsWorld,
} from "./helpers/nbs-world";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;
const SLUG = "event-builder-nbs-baseline-dbtest";

describeDb("NBS public render baseline on real rows", () => {
  let db: PrismaClient;
  let world: NbsWorld;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL missing (.env.local)");
    if (url.includes("ep-twilight-forest")) {
      throw new Error("Refusing to run: DATABASE_URL points at production.");
    }
    const adapter = new PrismaNeon({ connectionString: url });
    db = new PrismaClient({ adapter });
    world = await seedNbsWorld(db, SLUG);
  }, T);

  afterAll(async () => {
    if (db) {
      await cleanupWorld(db, SLUG);
      await db.$disconnect();
    }
  }, T);

  it(
    "resolves the published replica by slug with a server-derived workspace",
    async () => {
      const { resolvePublishedEventBySlug } = await import(
        "@/lib/public-event-loader"
      );
      const ref = await resolvePublishedEventBySlug(NBS_REPLICA_EVENT_SLUG);
      expect(ref).toEqual({
        workspaceId: world.workspace.id,
        eventId: world.eventId,
      });
    },
    T,
  );

  it(
    "assembles the anon DTO exactly as the live /e/ page consumes it",
    async () => {
      const { assemblePublicEventDTO } = await import(
        "@/lib/public-event-loader"
      );
      const dto = await assemblePublicEventDTO(NBS_REPLICA_EVENT_SLUG);
      expect(dto).not.toBeNull();
      if (!dto) throw new Error("unreachable");

      expect(dto.viewer).toBe("anon");
      expect(dto.isOperator).toBe(false);
      expect(dto.template).toBe("split");
      expect(dto.title).toBe("No Bad Saturday (baseline replica)");
      // The charge pipeline: guest lane, pay flow, 2500 cents.
      expect(dto.resolved).toMatchObject({ kind: "guest", priceCents: 2500 });
      expect(dto.steps).toEqual(["guestInfo", "pay", "submit"]);
      // The blanked workflow row renders zero ghost paths.
      expect(dto.workflowPaths).toEqual([]);
      // No v3 Gate on the replica: the door stays on the v1 flow.
      expect(dto.gated).toBe(false);
      expect(dto.existingRsvp).toBeNull();
      expect(dto.memberId).toBeNull();
    },
    T,
  );

  it(
    "keeps DRAFT events invisible to the public resolver",
    async () => {
      const { resolvePublishedEventBySlug } = await import(
        "@/lib/public-event-loader"
      );
      await db.event.update({
        where: { id: world.eventId },
        data: { status: "DRAFT" },
      });
      try {
        const ref = await resolvePublishedEventBySlug(NBS_REPLICA_EVENT_SLUG);
        expect(ref).toBeNull();
      } finally {
        await db.event.update({
          where: { id: world.eventId },
          data: { status: "PUBLISHED" },
        });
      }
    },
    T,
  );
});
