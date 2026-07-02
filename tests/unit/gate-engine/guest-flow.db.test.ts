/** M2 guest-flow acceptance - the token surface end-to-end on real rows
 *  against the confirmed dev branch (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  Exercises the REAL route handlers (called directly with Request objects),
 *  the REAL default engine + registry, and the FROZEN
 *  findOrCreateGuestMember helper. No PAY or ANSWER_QUESTIONS submissions are
 *  made here, so no Stripe or model calls occur - passive first-party
 *  verifiers only.
 */
import "./helpers/env";
import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import type { GuestGateView } from "@/lib/gate-engine/guest-view";
import { makeEvent, seedAcceptanceWorld, type AcceptanceWorld } from "./helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

type RouteModule = {
  GET: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
  POST: (req: Request, ctx: { params: Promise<{ token: string }> }) => Promise<Response>;
};

let db: PrismaClient;
let engine: GateEngine;
let route: RouteModule;
let world: AcceptanceWorld;
let gateId: string;
let token: string;

function ctx(t: string) {
  return { params: Promise.resolve({ token: t }) };
}

function getReq(t: string) {
  return new Request(`http://localhost/api/gate/${t}`);
}

function postReq(t: string, body: unknown) {
  return new Request(`http://localhost/api/gate/${t}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("M2 guest flow (route handlers on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    const gateEngine = await import("@/lib/gate-engine");
    engine = gateEngine.getGateEngine();
    route = (await import("@/app/api/gate/[token]/route")) as unknown as RouteModule;

    world = await seedAcceptanceWorld(db, "gate-m2-guest-flow");
    const eventId = await makeEvent(db, world.workspace.id, "gate-m2-guest-flow");
    const created = await engine.createGate({
      workspaceId: world.workspace.id,
      resource: { type: "EVENT", id: eventId },
      name: "Guest flow door",
      spec: {
        kind: "GROUP",
        rule: "ANY_N",
        requiredCount: 1,
        children: [
          { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} },
          { kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} },
        ],
      },
    });
    gateId = created.gateId;
    const session = await engine.createSession({
      workspaceId: world.workspace.id,
      gateId,
    });
    token = session.token;
  }, 180_000);

  it(
    "anonymous GET renders prompts with needsIdentity and no internals",
    async () => {
      const res = await route.GET(getReq(token), ctx(token));
      expect(res.status).toBe(200);
      const view = (await res.json()) as GuestGateView;
      if (!view.available) throw new Error("expected available");
      expect(view.needsIdentity).toBe(true);
      expect(view.open).toBe(false);
      expect(view.sections).toHaveLength(1);
      expect(view.sections[0].steps).toHaveLength(2);
      const raw = JSON.stringify(view);
      expect(raw).not.toMatch(/REJECTED|PENDING_REVIEW|ANY_N|FIRST_PARTY|rsvp/i);
    },
    T
  );

  it(
    "identify with a known referred email attaches the existing member and opens via the passive referral",
    async () => {
      const res = await route.POST(
        postReq(token, {
          action: "identify",
          email: world.referredGuest.email,
          name: "Gate M1 referred-guest",
        }),
        ctx(token)
      );
      expect(res.status).toBe(200);
      const view = (await res.json()) as GuestGateView;
      if (!view.available) throw new Error("expected available");
      expect(view.needsIdentity).toBe(false);
      expect(view.open).toBe(true);
      expect(view.headline).toBe("You're on the list");

      // The frozen helper found the EXISTING member (no duplicate row).
      const session = await db.gateSession.findUnique({ where: { token } });
      expect(session?.memberId).toBe(world.referredGuest.id);
      const duplicates = await db.member.count({
        where: { workspaceId: world.workspace.id, email: world.referredGuest.email },
      });
      expect(duplicates).toBe(1);
    },
    T
  );

  it(
    "an identified session is immutable - a second identify cannot swap the member",
    async () => {
      const res = await route.POST(
        postReq(token, {
          action: "identify",
          email: "someone-else@example.com",
          name: "Somebody Else",
        }),
        ctx(token)
      );
      expect(res.status).toBe(200);
      const session = await db.gateSession.findUnique({ where: { token } });
      expect(session?.memberId).toBe(world.referredGuest.id);
    },
    T
  );

  it(
    "unknown and expired tokens fail closed with 404",
    async () => {
      const unknown = await route.GET(getReq("tok_does_not_exist"), ctx("tok_does_not_exist"));
      expect(unknown.status).toBe(404);

      const expired = await db.gateSession.create({
        data: {
          workspaceId: world.workspace.id,
          gateId,
          expiresAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      const expiredRes = await route.GET(getReq(expired.token), ctx(expired.token));
      expect(expiredRes.status).toBe(404);
    },
    T
  );

  it(
    "a submit before identify is refused; a malformed body is a guest-safe 400",
    async () => {
      const anonSession = await engine.createSession({
        workspaceId: world.workspace.id,
        gateId,
      });
      const refused = await route.POST(
        postReq(anonSession.token, {
          action: "submit",
          nodeId: "whatever",
          submission: {},
        }),
        ctx(anonSession.token)
      );
      expect(refused.status).toBe(409);

      const malformed = await route.POST(
        postReq(token, { action: "nonsense" }),
        ctx(token)
      );
      expect(malformed.status).toBe(400);
      const body = (await malformed.json()) as { error?: string };
      expect(body.error).toBe("That request could not be read.");
    },
    T
  );
});
