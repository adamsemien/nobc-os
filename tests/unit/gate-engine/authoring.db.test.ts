/** M3 Builder acceptance - authoring + operator routes on real rows against
 *  the confirmed dev branch (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  Exercises the REAL operator route handlers and the REAL engine. Clerk and
 *  the role guard are mocked at the module boundary (M3-D8): requireRole is
 *  pre-existing audited infrastructure, and its workspace resolution
 *  auto-creates workspaces via Clerk - a test must never trigger that. The
 *  mock exercises the handlers' actual contract: call the guard, scope every
 *  query by the workspaceId it returns, refuse when it refuses.
 */
import "./helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import type { GuestGateView } from "@/lib/gate-engine/guest-view";
import { makeEvent, seedAcceptanceWorld, type AcceptanceWorld } from "./helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

const mockState = { workspaceId: "", allow: true };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_gm3_operator" })),
}));
vi.mock("@/lib/auth", () => ({
  requireWorkspaceId: vi.fn(async () => mockState.workspaceId),
}));
vi.mock("@/lib/operator-role", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireRole: vi.fn(async () =>
      mockState.allow
        ? {
            ok: true,
            userId: "user_gm3_operator",
            workspaceId: mockState.workspaceId,
            role: "STAFF",
          }
        : {
            ok: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
          }
    ),
  };
});

type Ctx = { params: Promise<{ id: string }> };
type GateRoute = {
  GET: (req: Request, ctx: Ctx) => Promise<Response>;
  PUT: (req: Request, ctx: Ctx) => Promise<Response>;
  DELETE: (req: Request, ctx: Ctx) => Promise<Response>;
};
type PreviewRoute = { POST: (req: Request, ctx: Ctx) => Promise<Response> };
type SessionsRoute = {
  GET: (req: Request, ctx: Ctx) => Promise<Response>;
  POST: (req: Request, ctx: Ctx) => Promise<Response>;
};
type PublicGateRoute = {
  GET: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
  POST: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
};

type TreeJson = {
  id: string;
  kind: string;
  conditionType: string | null;
  children: TreeJson[];
};
type GateJson = { gateId: string; name: string | null; tree: TreeJson | null } | null;

let db: PrismaClient;
let engine: GateEngine;
let gateRoute: GateRoute;
let previewRoute: PreviewRoute;
let sessionsRoute: SessionsRoute;
let publicRoute: PublicGateRoute;
let world: AcceptanceWorld;
let eventId: string;

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/operator/test", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function findByType(tree: TreeJson, conditionType: string): TreeJson | null {
  if (tree.conditionType === conditionType) return tree;
  for (const child of tree.children) {
    const hit = findByType(child, conditionType);
    if (hit) return hit;
  }
  return null;
}

const INITIAL_SPEC = {
  kind: "GROUP",
  rule: "ALL",
  children: [
    { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 5000 } },
    {
      kind: "GROUP",
      rule: "ANY_N",
      requiredCount: 1,
      children: [
        { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} },
        { kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} },
      ],
    },
  ],
};

describeDb("M3 Builder (authoring + operator routes on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    gateRoute = (await import(
      "@/app/api/operator/events/[id]/gate/route"
    )) as unknown as GateRoute;
    previewRoute = (await import(
      "@/app/api/operator/events/[id]/gate/preview/route"
    )) as unknown as PreviewRoute;
    sessionsRoute = (await import(
      "@/app/api/operator/events/[id]/gate/sessions/route"
    )) as unknown as SessionsRoute;
    publicRoute = (await import(
      "@/app/api/gate/[token]/route"
    )) as unknown as PublicGateRoute;

    world = await seedAcceptanceWorld(db, "gate-m3-authoring");
    mockState.workspaceId = world.workspace.id;
    mockState.allow = true;
    eventId = await makeEvent(db, world.workspace.id, "gate-m3-builder-event");
  }, 180_000);

  it(
    "criterion 1: PUT creates the gate and GET round-trips the same tree with stable ids",
    async () => {
      const put = await gateRoute.PUT(
        jsonReq("PUT", { name: "Builder door", spec: INITIAL_SPEC }),
        ctx(eventId)
      );
      expect(put.status).toBe(200);
      const created = ((await put.json()) as { gate: GateJson }).gate;
      if (!created?.tree) throw new Error("expected a created tree");
      expect(created.name).toBe("Builder door");

      const get = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
      expect(get.status).toBe(200);
      const loaded = ((await get.json()) as { gate: GateJson }).gate;
      if (!loaded?.tree) throw new Error("expected a loaded tree");
      expect(loaded.gateId).toBe(created.gateId);
      expect(JSON.stringify(loaded.tree)).toBe(JSON.stringify(created.tree));
      expect(findByType(loaded.tree, "PAY")).not.toBeNull();
      expect(findByType(loaded.tree, "REFERRED_BY_MEMBER")).not.toBeNull();
    },
    T
  );

  it(
    "criterion 2: an edit keeps node ids so proofs survive; a removed node's proofs detach",
    async () => {
      const get = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
      const gate = ((await get.json()) as { gate: GateJson }).gate;
      if (!gate?.tree) throw new Error("expected tree");
      const refNodeId = findByType(gate.tree, "REFERRED_BY_MEMBER")!.id;

      // A real passive verification lands a proof on the referral node.
      const decision = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: gate.gateId,
        memberId: world.referredGuest.id,
      });
      expect(decision.open).toBe(false); // PAY still unmet under ALL
      const proof = await db.gateProof.findFirst({
        where: { nodeId: refNodeId, memberId: world.referredGuest.id },
      });
      expect(proof?.status).toBe("SATISFIED");

      // Edit: keep everything (ids round-tripped), add a step at the root.
      const editedSpec = {
        kind: "GROUP",
        id: gate.tree.id,
        rule: "ALL",
        children: [
          ...gate.tree.children.map(function keep(node: TreeJson): unknown {
            if (node.kind === "CONDITION") {
              return {
                kind: "CONDITION",
                id: node.id,
                conditionType: node.conditionType,
                config:
                  node.conditionType === "PAY" ? { priceCents: 5000 } : {},
              };
            }
            return {
              kind: "GROUP",
              id: node.id,
              rule: "ANY_N",
              requiredCount: 1,
              children: node.children.map(keep),
            };
          }),
          { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} },
        ],
      };
      const put = await gateRoute.PUT(jsonReq("PUT", { spec: editedSpec }), ctx(eventId));
      expect(put.status).toBe(200);
      const edited = ((await put.json()) as { gate: GateJson }).gate;
      if (!edited?.tree) throw new Error("expected edited tree");

      // Kept id, surviving proof, still satisfied for the member.
      expect(findByType(edited.tree, "REFERRED_BY_MEMBER")!.id).toBe(refNodeId);
      const survivor = await db.gateProof.findFirst({
        where: { nodeId: refNodeId, memberId: world.referredGuest.id },
      });
      expect(survivor?.id).toBe(proof!.id);
      const after = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: gate.gateId,
        memberId: world.referredGuest.id,
      });
      const refNode = after.evaluation?.nodes.find((n) => n.nodeId === refNodeId);
      expect(refNode?.satisfied).toBe(true);

      // Second edit: remove the referral branch entirely - the proof detaches.
      const withoutReferral = {
        kind: "GROUP",
        id: edited.tree.id,
        rule: "ALL",
        children: [
          {
            kind: "CONDITION",
            id: findByType(edited.tree, "PAY")!.id,
            conditionType: "PAY",
            config: { priceCents: 5000 },
          },
          {
            kind: "CONDITION",
            id: findByType(edited.tree, "HOLD_MEMBERSHIP")!.id,
            conditionType: "HOLD_MEMBERSHIP",
            config: {},
          },
        ],
      };
      const put2 = await gateRoute.PUT(
        jsonReq("PUT", { spec: withoutReferral }),
        ctx(eventId)
      );
      expect(put2.status).toBe(200);
      const detached = await db.gateProof.findUnique({ where: { id: proof!.id } });
      expect(detached?.nodeId).toBeNull();
      expect(detached?.conditionType).toBe("REFERRED_BY_MEMBER"); // history intact

      // Restore the full door for the later session test.
      const restore = await gateRoute.PUT(
        jsonReq("PUT", { spec: INITIAL_SPEC }),
        ctx(eventId)
      );
      expect(restore.status).toBe(200);
    },
    T
  );

  it(
    "criterion 3: PUT and preview share the validator - invalid drafts are 422 / reported, nothing persists",
    async () => {
      const before = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
      const beforeTree = JSON.stringify(((await before.json()) as { gate: GateJson }).gate?.tree);

      const tooDeep = {
        kind: "GROUP",
        rule: "ALL",
        children: [
          {
            kind: "GROUP",
            rule: "ALL",
            children: [
              {
                kind: "GROUP",
                rule: "ALL",
                children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 100 } }],
              },
            ],
          },
        ],
      };
      const put = await gateRoute.PUT(jsonReq("PUT", { spec: tooDeep }), ctx(eventId));
      expect(put.status).toBe(422);
      const putErrors = ((await put.json()) as { errors: string[] }).errors;
      expect(putErrors.length).toBeGreaterThan(0);

      const preview = await previewRoute.POST(
        jsonReq("POST", { spec: tooDeep }),
        ctx(eventId)
      );
      expect(preview.status).toBe(200);
      const previewBody = (await preview.json()) as { valid: boolean; errors: string[] };
      expect(previewBody.valid).toBe(false);
      expect(previewBody.errors).toEqual(putErrors);

      const after = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
      expect(JSON.stringify(((await after.json()) as { gate: GateJson }).gate?.tree)).toBe(
        beforeTree
      );
    },
    T
  );

  it(
    "criterion 4: the preview is guest-safe for all five condition types",
    async () => {
      const allFive = {
        kind: "GROUP",
        rule: "ALL",
        children: [
          { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 5000 } },
          {
            kind: "GROUP",
            rule: "ANY_N",
            requiredCount: 1,
            children: [
              { kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} },
              { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} },
              { kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} },
              { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} },
            ],
          },
        ],
      };
      const res = await previewRoute.POST(jsonReq("POST", { spec: allFive }), ctx(eventId));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        valid: boolean;
        view: GuestGateView | null;
      };
      expect(body.valid).toBe(true);
      if (!body.view?.available) throw new Error("expected an available view");
      const raw = JSON.stringify(body.view);
      expect(raw).toContain("Get Ticket - $50.00");
      expect(raw).not.toMatch(/rsvp/i);
      expect(raw).not.toMatch(/\bNBC\b/);
      expect(raw).not.toContain("—");
      expect(raw).not.toMatch(
        /\b(ANY_N|WEIGHTED|SATISFIED|REJECTED|PENDING_REVIEW|FIRST_PARTY|AI_ATTESTED)\b/
      );
    },
    T
  );

  it(
    "criterion 5: writes are refused below STAFF; reads still answer",
    async () => {
      mockState.allow = false;
      try {
        const put = await gateRoute.PUT(
          jsonReq("PUT", { spec: INITIAL_SPEC }),
          ctx(eventId)
        );
        expect(put.status).toBe(403);
        const del = await gateRoute.DELETE(jsonReq("DELETE"), ctx(eventId));
        expect(del.status).toBe(403);
        const mint = await sessionsRoute.POST(jsonReq("POST"), ctx(eventId));
        expect(mint.status).toBe(403);

        const get = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
        expect(get.status).toBe(200);
      } finally {
        mockState.allow = true;
      }
    },
    T
  );

  it(
    "criterion 6: a minted link works end-to-end and the list reflects the traversal",
    async () => {
      const mint = await sessionsRoute.POST(jsonReq("POST"), ctx(eventId));
      expect(mint.status).toBe(200);
      const { token, path } = (await mint.json()) as { token: string; path: string };
      expect(path).toBe(`/gate/${token}`);

      // The M2 public surface serves the minted token.
      const pub = await publicRoute.GET(
        new Request(`http://localhost/api/gate/${token}`),
        { params: Promise.resolve({ token }) }
      );
      expect(pub.status).toBe(200);

      // Identify through the public flow; the operator list shows the member.
      const identify = await publicRoute.POST(
        new Request(`http://localhost/api/gate/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "identify",
            email: world.referredGuest.email,
            name: "Gate M3 guest",
          }),
        }),
        { params: Promise.resolve({ token }) }
      );
      expect(identify.status).toBe(200);

      const list = await sessionsRoute.GET(jsonReq("GET"), ctx(eventId));
      expect(list.status).toBe(200);
      const { sessions } = (await list.json()) as {
        sessions: { token: string; status: string; member: { email: string } | null }[];
      };
      const row = sessions.find((s) => s.token === token);
      expect(row?.member?.email).toBe(world.referredGuest.email);

      // Deleting the gate cascades sessions and 404s the public token.
      const del = await gateRoute.DELETE(jsonReq("DELETE"), ctx(eventId));
      expect(del.status).toBe(200);
      const gone = await gateRoute.GET(jsonReq("GET"), ctx(eventId));
      expect(((await gone.json()) as { gate: GateJson }).gate).toBeNull();
      const pubGone = await publicRoute.GET(
        new Request(`http://localhost/api/gate/${token}`),
        { params: Promise.resolve({ token }) }
      );
      expect(pubGone.status).toBe(404);
    },
    T
  );
});
