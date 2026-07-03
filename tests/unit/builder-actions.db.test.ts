/** Phase B acceptance - the builder action layer on real rows (env-gated:
 *  GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  Acceptance 1 (mechanics): one action creates a publishable smart-default
 *  draft; publish is a switch. Acceptance 3: the action layer writes ONLY the
 *  v3 shape - legacy accessMode / priceInCents / approvalRequired /
 *  eventAccess / EventWorkflow.paths stay untouched by every action.
 *  Acceptance 2: the draft preview DTO and the post-publish public DTO are
 *  the same assembly output for the same data.
 *
 *  Auth is mocked at the module boundary (Clerk session + workspace resolve
 *  + role); everything below - actions, engine, loader - is real.
 */
import "./gate-engine/helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient, Workspace } from "@prisma/client";

const authState = { userId: "user_builder_test" as string | null, workspaceId: "" };

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

import { seedBuilderWorld } from "./helpers/nbs-world";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

type Actions = typeof import("@/lib/builder/actions");

let db: PrismaClient;
let actions: Actions;
let workspace: Workspace;

/** The legacy columns the new builder must never write. */
async function legacySnapshot(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      accessMode: true,
      priceInCents: true,
      approvalRequired: true,
      eventAccess: true,
    },
  });
  const workflow = await db.eventWorkflow.findUnique({
    where: { eventId },
    select: { paths: true },
  });
  return { event, workflow };
}

describeDb("Phase B builder actions on real rows", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    actions = await import("@/lib/builder/actions");
    workspace = await seedBuilderWorld(db, "event-builder-actions-dbtest");
    authState.workspaceId = workspace.id;
  }, 180_000);

  it(
    "acceptance 1: one action mints a smart-defaulted, immediately publishable draft",
    async () => {
      const created = await actions.createEventDraft({ title: "Test Salon" });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error("unreachable");

      const event = await db.event.findUnique({
        where: { id: created.eventId },
        select: { status: true, title: true, slug: true, startAt: true, template: true },
      });
      expect(event).toMatchObject({
        status: "DRAFT",
        title: "Test Salon",
        slug: "test-salon",
        template: "split",
      });
      expect(event?.startAt).toBeTruthy(); // smart default, never required

      // Publish is a switch - no required-field wall.
      const published = await actions.publishEvent(created.eventId, { confirm: true });
      expect(published.ok).toBe(true);
      const after = await db.event.findUnique({
        where: { id: created.eventId },
        select: { status: true },
      });
      expect(after?.status).toBe("PUBLISHED");

      // The switch demands the literal confirm the AI composer never sets.
      const unpub = await actions.unpublishEvent(created.eventId);
      expect(unpub.ok).toBe(true);
      const refused = await actions.publishEvent(created.eventId, {
        confirm: false as unknown as true,
      });
      expect(refused.ok).toBe(false);
    },
    T,
  );

  it(
    "acceptance 3: every action writes ONLY the v3 shape - zero legacy access writes",
    async () => {
      const created = await actions.createEventDraft({ title: "Legacy Guard" });
      if (!created.ok) throw new Error("draft failed");
      const before = await legacySnapshot(created.eventId);
      expect(before.workflow).toBeNull(); // the ghost-card row is never minted

      await actions.updateEventDetails(created.eventId, {
        description: "An evening.",
        capacity: 60,
      });
      await actions.setGateSpec(created.eventId, {
        kind: "GROUP",
        rule: "ALL",
        children: [
          {
            kind: "GROUP",
            rule: "ANY_N",
            requiredCount: 1,
            children: [
              { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} },
              { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 4000 } },
            ],
          },
          {
            kind: "CONDITION",
            conditionType: "COLLECT_INFO",
            config: {
              questions: [{ id: "q1", label: "Who invited you?", type: "text", required: true }],
            },
          },
        ],
      });
      await actions.setServiceFee(created.eventId, { mode: "pass_stripe_only" });
      await actions.createCompCode(created.eventId, { code: "FRIENDS" });
      await actions.publishEvent(created.eventId, { confirm: true });

      const after = await legacySnapshot(created.eventId);
      expect(after).toEqual(before); // byte-for-byte: legacy shape untouched

      // And the v3 shape is real: a gate exists with the composed tree.
      const gate = await db.gate.findFirst({
        where: { workspaceId: workspace.id, resourceType: "EVENT", resourceId: created.eventId },
        select: { id: true },
      });
      expect(gate).not.toBeNull();
      const nodes = await db.gateNode.findMany({
        where: { gateId: gate!.id },
        select: { kind: true, conditionType: true, rule: true },
      });
      expect(nodes.filter((n) => n.kind === "CONDITION")).toHaveLength(3);
    },
    T,
  );

  it(
    "acceptance 2: the draft preview DTO and the published public DTO are one assembly",
    async () => {
      const { assembleDraftPreviewDTO, assemblePublicEventDTO } = await import(
        "@/lib/public-event-loader"
      );
      const created = await actions.createEventDraft({ title: "Parity Check" });
      if (!created.ok) throw new Error("draft failed");
      await actions.setGateSpec(created.eventId, {
        kind: "GROUP",
        rule: "ALL",
        children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } }],
      });

      // DRAFT: the public resolver refuses it, the preview assembly renders it.
      expect(await assemblePublicEventDTO(created.slug)).toBeNull();
      const draftDto = await assembleDraftPreviewDTO(workspace.id, created.eventId);
      expect(draftDto).not.toBeNull();
      expect(draftDto).toMatchObject({ viewer: "anon", gated: true, title: "Parity Check" });

      // Publish, then compare: identical output for identical data.
      await actions.publishEvent(created.eventId, { confirm: true });
      const publicDto = await assemblePublicEventDTO(created.slug);
      const previewDto = await assembleDraftPreviewDTO(workspace.id, created.eventId);
      expect(previewDto).toEqual(publicDto);
    },
    T,
  );

  it(
    "loose ends L1: a fresh draft mints the open gate - anon preview shows the open door and anyone gets in",
    async () => {
      const created = await actions.createEventDraft({ title: "Open Door Default" });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error("unreachable");

      // The default gate is the canonical open spec: one OPEN condition.
      const gate = await db.gate.findFirst({
        where: {
          workspaceId: workspace.id,
          resourceType: "EVENT",
          resourceId: created.eventId,
        },
        select: { id: true, nodes: { select: { kind: true, conditionType: true } } },
      });
      expect(gate).not.toBeNull();
      const conditions = gate!.nodes.filter((n) => n.kind === "CONDITION");
      expect(conditions).toEqual([{ kind: "CONDITION", conditionType: "OPEN" }]);

      // Acceptance 3's letter: the builder never WRITES the legacy shape.
      // Event.eventAccess carries a members-only column default the builder
      // must not touch - the fresh draft's value equals a raw row's default,
      // and the gated render below never reads it.
      const bare = await db.event.create({
        data: {
          workspaceId: workspace.id,
          title: "No Gate",
          slug: "loose-ends-no-gate",
          status: "DRAFT",
          startAt: new Date("2026-08-01T20:00:00Z"),
        },
        select: { id: true, eventAccess: true },
      });
      const legacy = await legacySnapshot(created.eventId);
      expect(legacy.event?.eventAccess).toEqual(bare.eventAccess);

      // The anon preview renders the OPEN state, not the members-only card:
      // the gate owns the door (gated) and it is the open door (gateOpen ->
      // the CTA reads "Register").
      const { assembleDraftPreviewDTO } = await import("@/lib/public-event-loader");
      const dto = await assembleDraftPreviewDTO(workspace.id, created.eventId);
      expect(dto).toMatchObject({ viewer: "anon", gated: true, gateOpen: true });

      // Counterfactual (the old mismatch, pinned): an event with no gate is
      // neither gated nor open-gated - its door still falls to the legacy
      // members-only default.
      const bareDto = await assembleDraftPreviewDTO(workspace.id, bare.id);
      expect(bareDto).toMatchObject({ gated: false, gateOpen: false });

      // And anyone actually gets in: an anonymous guest identifies on the
      // walkthrough and the bridge hands them a confirmed seat.
      const engine = (await import("@/lib/gate-engine")).getGateEngine();
      const publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as {
        POST: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
      };
      const session = await engine.createSession({
        workspaceId: workspace.id,
        gateId: gate!.id,
      });
      const identify = await publicRoute.POST(
        new Request(`http://localhost/api/gate/${session.token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.77.0.1" },
          body: JSON.stringify({
            action: "identify",
            email: "open-door-guest@example.com",
            name: "Open Door Guest",
          }),
        }),
        { params: Promise.resolve({ token: session.token }) },
      );
      expect(identify.status).toBe(200);

      const guest = await db.member.findFirst({
        where: { workspaceId: workspace.id, email: "open-door-guest@example.com" },
        select: { id: true },
      });
      expect(guest).not.toBeNull();
      const decision = await engine.evaluateGate({
        workspaceId: workspace.id,
        gateId: gate!.id,
        memberId: guest!.id,
        sessionId: session.sessionId,
      });
      expect(decision.open).toBe(true);
      const seat = await db.rSVP.findFirst({
        where: { workspaceId: workspace.id, eventId: created.eventId, memberId: guest!.id },
        select: { ticketStatus: true },
      });
      expect(seat?.ticketStatus).toBe("confirmed");
    },
    T,
  );

  it(
    "comp codes: create is idempotent-guarded and deactivate closes the window",
    async () => {
      const created = await actions.createEventDraft({ title: "Comp Codes" });
      if (!created.ok) throw new Error("draft failed");
      const first = await actions.createCompCode(created.eventId, {
        code: "houselist",
        maxUses: 5,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("unreachable");
      const dupe = await actions.createCompCode(created.eventId, { code: "HOUSELIST" });
      expect(dupe.ok).toBe(false);

      const off = await actions.deactivateCompCode(created.eventId, first.promoCodeId);
      expect(off.ok).toBe(true);
      const promo = await db.promoCode.findUnique({
        where: { id: first.promoCodeId },
        select: { code: true, validUntil: true, discountType: true },
      });
      expect(promo?.code).toBe("HOUSELIST");
      expect(promo?.discountType).toBe("comp");
      expect(promo?.validUntil).not.toBeNull();
    },
    T,
  );

  it(
    "workspace boundary: actions refuse an event from another workspace",
    async () => {
      const created = await actions.createEventDraft({ title: "Mine" });
      if (!created.ok) throw new Error("draft failed");
      const originalWorkspace = authState.workspaceId;
      try {
        authState.workspaceId = "some-other-workspace";
        const res = await actions.updateEventDetails(created.eventId, { title: "Theirs" });
        expect(res.ok).toBe(false);
        const publish = await actions.publishEvent(created.eventId, { confirm: true });
        expect(publish.ok).toBe(false);
      } finally {
        authState.workspaceId = originalWorkspace;
      }
      const untouched = await db.event.findUnique({
        where: { id: created.eventId },
        select: { title: true, status: true },
      });
      expect(untouched).toEqual({ title: "Mine", status: "DRAFT" });
    },
    T,
  );
});
