/** Phase D - cutover converter rehearsal on real rows (env-gated:
 *  GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  Acceptance 8 partner: converts an NBS-shape REPLICA (never the prod row),
 *  proves the gate is the documented equivalent composition, proves every
 *  legacy field is byte-identical, and proves rollback restores the legacy
 *  render exactly.
 */
import "./gate-engine/helpers/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { cleanupWorld, seedNbsWorld, type NbsWorld } from "./helpers/nbs-world";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;
const SLUG = "event-builder-cutover-rehearsal";

describeDb("NBS cutover converter rehearsal", () => {
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
  }, T);

  afterAll(async () => {
    if (db) {
      await cleanupWorld(db, SLUG);
      await db.$disconnect();
    }
  }, T);

  async function legacySnapshot() {
    const event = await db.event.findUnique({
      where: { id: world.eventId },
      select: {
        eventAccess: true,
        accessMode: true,
        priceInCents: true,
        approvalRequired: true,
        status: true,
      },
    });
    const workflow = await db.eventWorkflow.findUnique({
      where: { eventId: world.eventId },
      select: { paths: true },
    });
    return { event, workflow };
  }

  it(
    "dry run plans the documented composition and writes nothing",
    async () => {
      const { convertEvent } = await import("@/scripts/cutover/nbs-to-v3");
      const before = await legacySnapshot();
      const plan = await convertEvent(db, { eventId: world.eventId, execute: false });
      expect(plan.ok).toBe(true);
      if (!plan.ok) throw new Error("unreachable");
      expect(plan.spec).toEqual({
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
      });
      expect(
        await db.gate.count({ where: { workspaceId: world.workspace.id } }),
      ).toBe(0);
      expect(await legacySnapshot()).toEqual(before);
    },
    T,
  );

  it(
    "execute creates the gate, flips the public door, leaves legacy bytes identical - rollback restores everything",
    async () => {
      const { convertEvent, rollbackEvent } = await import("@/scripts/cutover/nbs-to-v3");
      const { assembleDraftPreviewDTO } = await import("@/lib/public-event-loader");
      const before = await legacySnapshot();
      const beforeDto = await assembleDraftPreviewDTO(world.workspace.id, world.eventId);
      expect(beforeDto?.gated).toBe(false);

      const result = await convertEvent(db, { eventId: world.eventId, execute: true });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.executed).toBe(true);

      // Legacy shape untouched; the door now runs the gate.
      expect(await legacySnapshot()).toEqual(before);
      const gatedDto = await assembleDraftPreviewDTO(world.workspace.id, world.eventId);
      expect(gatedDto?.gated).toBe(true);
      // Everything else on the page is the same data.
      expect(gatedDto?.resolved).toEqual(beforeDto?.resolved);
      expect(gatedDto?.title).toBe(beforeDto?.title);

      // Idempotence: a second convert refuses rather than double-gating.
      const again = await convertEvent(db, { eventId: world.eventId, execute: true });
      expect(again.ok).toBe(false);

      // Rollback: gate gone, render byte-identical to the start.
      const rolled = await rollbackEvent(db, world.eventId);
      expect(rolled.removed).toBe(true);
      expect(await legacySnapshot()).toEqual(before);
      const restoredDto = await assembleDraftPreviewDTO(world.workspace.id, world.eventId);
      expect(restoredDto).toEqual(beforeDto);
    },
    T,
  );
});
