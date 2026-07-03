/** Phase E acceptance - AI composition through the action layer on real rows
 *  (env-gated: GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  The addendum's example prompt produces the correct draft: right gate
 *  composition (members free OR pay $40 OR apply - any one), right price,
 *  right cap, DRAFT status, zero publish, zero Stripe contact. The planner
 *  port is injected (no network); everything below it - the composition
 *  executor, the ENTIRE action layer, the engine - runs for real.
 */
import "./gate-engine/helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient, Workspace } from "@prisma/client";

const authState = { userId: "user_compose_test" as string | null, workspaceId: "" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
}));
vi.mock("@/lib/auth", () => ({
  getMemberWorkspaceId: vi.fn(async () => authState.workspaceId || null),
}));
vi.mock("@/lib/operator-role", () => ({
  getEffectiveRole: vi.fn(async () => "ADMIN"),
  roleAtLeast: () => true,
  requireRolePage: vi.fn(),
}));
// Any Stripe touch is a test failure.
vi.mock("@/lib/stripe", () => ({
  stripe: new Proxy(
    {},
    {
      get() {
        throw new Error("Stripe must never be touched by composition");
      },
    },
  ),
}));

import { seedBuilderWorld } from "./helpers/nbs-world";
import type { CompositionPlan } from "@/lib/builder/compose";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

const EXAMPLE_PROMPT =
  "Saturday dinner at Chateau Chloe, $40, members free, 60 cap, apply or pay";

/** What JUDGMENT_MODEL should produce for the example prompt - injected so
 *  the test is deterministic and offline. */
const EXAMPLE_PLAN: CompositionPlan = {
  title: "Saturday Dinner at Chateau Chloe",
  description: null,
  startAt: null,
  location: "Chateau Chloe",
  capacity: 60,
  requiredAll: [],
  anyOneOf: [
    { kind: "member" },
    { kind: "pay", priceCents: 4000 },
    { kind: "apply" },
  ],
  serviceFeeMode: "absorb",
  compCode: null,
  assumptions: [
    "Date defaulted to next Saturday 8pm - move it if the dinner is another night.",
  ],
};

let db: PrismaClient;
let workspace: Workspace;

describeDb("Phase E - compose the example prompt into a correct draft", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    workspace = await seedBuilderWorld(db, "event-builder-compose-dbtest");
    authState.workspaceId = workspace.id;
  }, 180_000);

  it(
    "acceptance (Decision 6/E): right gate, right price, right cap, DRAFT, no publish, no Stripe",
    async () => {
      const { composeEventFromPrompt } = await import("@/lib/builder/compose");
      const result = await composeEventFromPrompt(EXAMPLE_PROMPT, {
        planner: async () => EXAMPLE_PLAN,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.summary.join(" ")).toContain("Nothing is published");

      const event = await db.event.findUnique({
        where: { id: result.eventId },
        select: {
          status: true,
          title: true,
          location: true,
          capacity: true,
          startAt: true,
          workspaceId: true,
        },
      });
      expect(event).toMatchObject({
        status: "DRAFT", // zero publish - always a draft
        title: "Saturday Dinner at Chateau Chloe",
        location: "Chateau Chloe",
        capacity: 60,
        workspaceId: workspace.id,
      });
      expect(event?.startAt).toBeTruthy(); // smart default flagged in summary

      // The gate: ALL [ ANY_1 [ HOLD_MEMBERSHIP, PAY 4000, ANSWER_QUESTIONS ] ]
      const gate = await db.gate.findFirst({
        where: {
          workspaceId: workspace.id,
          resourceType: "EVENT",
          resourceId: result.eventId,
        },
        select: { id: true },
      });
      expect(gate).not.toBeNull();
      const nodes = await db.gateNode.findMany({
        where: { gateId: gate!.id },
        orderBy: { position: "asc" },
        select: {
          kind: true,
          rule: true,
          requiredCount: true,
          conditionType: true,
          config: true,
          parentId: true,
        },
      });
      const root = nodes.find((n) => n.parentId === null);
      expect(root).toMatchObject({ kind: "GROUP", rule: "ALL" });
      const group = nodes.find((n) => n.kind === "GROUP" && n.rule === "ANY_N");
      expect(group).toMatchObject({ requiredCount: 1 });
      const types = nodes
        .filter((n) => n.kind === "CONDITION")
        .map((n) => n.conditionType)
        .sort();
      expect(types).toEqual(["ANSWER_QUESTIONS", "HOLD_MEMBERSHIP", "PAY"]);
      const pay = nodes.find((n) => n.conditionType === "PAY");
      expect(pay?.config).toMatchObject({ priceCents: 4000 });
    },
    T,
  );

  it(
    "a junk plan from the model fails closed with a guest-safe error",
    async () => {
      const { composeEventFromPrompt } = await import("@/lib/builder/compose");
      const result = await composeEventFromPrompt("whatever", {
        planner: async () => ({ nonsense: true }) as unknown as CompositionPlan,
      });
      expect(result).toEqual({
        ok: false,
        error: "Could not compose that - try rephrasing.",
      });
    },
    T,
  );
});
