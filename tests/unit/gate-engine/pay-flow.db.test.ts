/** M4-PAY acceptance - the in-page pay flow on real rows against the
 *  confirmed dev branch (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  lib/stripe is mocked at the module boundary: the REAL mint route and the
 *  REAL M1 verifier run against a fake Stripe client, so the tests assert the
 *  exact params sent to Stripe (amount, metadata binding, idempotency key,
 *  auto-capture) without any network call. Everything else - routes, engine,
 *  proofs - is real.
 */
import "./helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import { makeEvent, seedAcceptanceWorld, type AcceptanceWorld } from "./helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

type CreateCall = {
  params: {
    amount: number;
    currency: string;
    capture_method?: string;
    metadata: Record<string, string>;
  };
  options: { idempotencyKey?: string };
};

const mockStripeState = {
  createCalls: [] as CreateCall[],
  snapshots: new Map<string, Record<string, unknown>>(),
  seq: 0,
};

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async (params: CreateCall["params"], options: CreateCall["options"]) => {
        mockStripeState.seq += 1;
        const id = `pi_gate_test_${mockStripeState.seq}`;
        mockStripeState.createCalls.push({ params, options });
        return { id, client_secret: `${id}_secret`, status: "requires_payment_method" };
      }),
      retrieve: vi.fn(async (id: string) => mockStripeState.snapshots.get(id) ?? null),
    },
  },
}));

type TokenCtx = { params: Promise<{ token: string }> };
type PublicGateRoute = { POST: (req: Request, ctx: TokenCtx) => Promise<Response> };
type IntentRoute = { POST: (req: Request, ctx: TokenCtx) => Promise<Response> };

let db: PrismaClient;
let engine: GateEngine;
let publicRoute: PublicGateRoute;
let intentRoute: IntentRoute;
let world: AcceptanceWorld;
let gateId: string;
let payNodeId: string;

function tokenCtx(token: string): TokenCtx {
  return { params: Promise.resolve({ token }) };
}
function post(token: string, path: string, body: unknown, ip: string): Request {
  return new Request(`http://localhost/api/gate/${token}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function identifiedSession(email: string, ip: string) {
  const session = await engine.createSession({ workspaceId: world.workspace.id, gateId });
  const res = await publicRoute.POST(
    post(session.token, "", { action: "identify", email, name: "Gate PAY guest" }, ip),
    tokenCtx(session.token)
  );
  expect(res.status).toBe(200);
  return session;
}

function lastCreate(): CreateCall {
  return mockStripeState.createCalls[mockStripeState.createCalls.length - 1];
}

describeDb("M4-PAY flow (mint + confirm + verify on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as PublicGateRoute;
    intentRoute = (await import(
      "@/app/api/gate/[token]/payment-intent/route"
    )) as unknown as IntentRoute;

    world = await seedAcceptanceWorld(db, "gate-m4-pay");
    const eventId = await makeEvent(db, world.workspace.id, "gate-m4-pay-event");
    const created = await engine.createGate({
      workspaceId: world.workspace.id,
      resource: { type: "EVENT", id: eventId },
      name: "PAY door",
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 5000 } }],
      },
    });
    gateId = created.gateId;
    const node = await db.gateNode.findFirst({
      where: { gateId, conditionType: "PAY" },
      select: { id: true },
    });
    payNodeId = node!.id;
  }, 180_000);

  it(
    "criterion 1: mint binds the intent to the member with auto-capture and an idempotency key",
    async () => {
      const session = await identifiedSession(world.applicant.email, "10.9.0.1");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.1"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { clientSecret?: string };
      expect(body.clientSecret).toMatch(/_secret$/);

      const call = lastCreate();
      expect(call.params.amount).toBe(5000);
      expect(call.params.currency).toBe("usd");
      expect(call.params.capture_method).toBeUndefined(); // auto-capture (Decision 1)
      expect(call.params.metadata).toMatchObject({
        kind: "gate-pay",
        workspaceId: world.workspace.id,
        gateId,
        nodeId: payNodeId,
        memberId: world.applicant.id,
        gateSessionId: session.sessionId,
      });
      expect(call.options.idempotencyKey).toBe(
        `gate-pay:${session.sessionId}:${payNodeId}:5000`
      );
    },
    T
  );

  it(
    "criterion 2: a succeeded intent submitted through the public API opens the gate with an honest proof",
    async () => {
      const session = await identifiedSession(world.applicant.email, "10.9.0.2");
      const mint = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.2"),
        tokenCtx(session.token)
      );
      expect(mint.status).toBe(200);
      const intentId = `pi_gate_test_${mockStripeState.seq}`;
      mockStripeState.snapshots.set(intentId, {
        id: intentId,
        status: "succeeded",
        amount_received: 5000,
        currency: "usd",
        metadata: { memberId: world.applicant.id },
      });

      const submit = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "submit", nodeId: payNodeId, submission: { paymentIntentId: intentId } },
          "10.9.0.2"
        ),
        tokenCtx(session.token)
      );
      expect(submit.status).toBe(200);
      const view = (await submit.json()) as { open?: boolean };
      expect(view.open).toBe(true);

      const proof = await db.gateProof.findFirst({
        where: { nodeId: payNodeId, memberId: world.applicant.id },
      });
      expect(proof?.status).toBe("SATISFIED");
      expect(proof?.tier).toBe("FIRST_PARTY");
      expect(proof?.mechanism).toBe("STRIPE_PAYMENT");
      expect((proof?.payload as { paymentIntentId?: string })?.paymentIntentId).toBe(intentId);
    },
    T
  );

  it(
    "criterion 3: a paid step never mints again (established truth)",
    async () => {
      const session = await identifiedSession(world.applicant.email, "10.9.0.3");
      const callsBefore = mockStripeState.createCalls.length;
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.3"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { alreadyPaid?: boolean }).alreadyPaid).toBe(true);
      expect(mockStripeState.createCalls.length).toBe(callsBefore);
    },
    T
  );

  it(
    "criterion 4: underpaid and foreign intents are rejected server-side",
    async () => {
      // Underpaid: the amount is re-checked at verification, never trusted.
      const underpaid = await identifiedSession(world.paidOnlyGuest.email, "10.9.0.4");
      await intentRoute.POST(
        post(underpaid.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.4"),
        tokenCtx(underpaid.token)
      );
      const shortId = `pi_gate_test_${mockStripeState.seq}`;
      mockStripeState.snapshots.set(shortId, {
        id: shortId,
        status: "succeeded",
        amount_received: 100,
        currency: "usd",
        metadata: { memberId: world.paidOnlyGuest.id },
      });
      const shortSubmit = await publicRoute.POST(
        post(
          underpaid.token,
          "",
          { action: "submit", nodeId: payNodeId, submission: { paymentIntentId: shortId } },
          "10.9.0.4"
        ),
        tokenCtx(underpaid.token)
      );
      expect(shortSubmit.status).toBe(200);
      const shortProof = await db.gateProof.findFirst({
        where: { nodeId: payNodeId, memberId: world.paidOnlyGuest.id },
      });
      expect(shortProof?.status).toBe("REJECTED");

      // Foreign: another member's intent never satisfies this member.
      const thief = await identifiedSession(world.attendee.email, "10.9.0.5");
      const paidId = "pi_gate_test_2"; // criterion 2's succeeded intent
      const theft = await publicRoute.POST(
        post(
          thief.token,
          "",
          { action: "submit", nodeId: payNodeId, submission: { paymentIntentId: paidId } },
          "10.9.0.5"
        ),
        tokenCtx(thief.token)
      );
      expect(theft.status).toBe(200);
      const theftView = (await theft.json()) as { open?: boolean };
      expect(theftView.open).toBe(false);
      const theftProof = await db.gateProof.findFirst({
        where: { nodeId: payNodeId, memberId: world.attendee.id },
      });
      expect(theftProof?.status).toBe("REJECTED");
    },
    T
  );

  it(
    "criterion 5: guards - pre-identity 409, unknown node 400, per-token rate limit 429",
    async () => {
      const anon = await engine.createSession({ workspaceId: world.workspace.id, gateId });
      const preIdentity = await intentRoute.POST(
        post(anon.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.6"),
        tokenCtx(anon.token)
      );
      expect(preIdentity.status).toBe(409);

      const session = await identifiedSession(world.revocable.email, "10.9.0.7");
      const badNode = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: "not-a-node" }, "10.9.0.7"),
        tokenCtx(session.token)
      );
      expect(badNode.status).toBe(400);

      // 6/min per token+IP: burn the budget, the 7th call is refused.
      const limited = await identifiedSession(world.referrer.email, "10.9.0.8");
      for (let i = 0; i < 6; i++) {
        const res = await intentRoute.POST(
          post(limited.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.8"),
          tokenCtx(limited.token)
        );
        expect(res.status).toBe(200);
      }
      const blocked = await intentRoute.POST(
        post(limited.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.8"),
        tokenCtx(limited.token)
      );
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    },
    T
  );

  it(
    "criterion 6: the live-key rail - a live secret key refuses to mint unless explicitly opted in",
    async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY;
      const originalFlag = process.env.GATE_PAY_LIVE_CHARGES;
      const session = await identifiedSession(world.staleApplicant.email, "10.9.0.9");
      try {
        process.env.STRIPE_SECRET_KEY = "sk_live_fixture_never_real";
        delete process.env.GATE_PAY_LIVE_CHARGES;
        const refused = await intentRoute.POST(
          post(session.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.9"),
          tokenCtx(session.token)
        );
        expect(refused.status).toBe(503);

        process.env.GATE_PAY_LIVE_CHARGES = "1";
        const optedIn = await intentRoute.POST(
          post(session.token, "/payment-intent", { nodeId: payNodeId }, "10.9.0.9"),
          tokenCtx(session.token)
        );
        expect(optedIn.status).toBe(200);
      } finally {
        process.env.STRIPE_SECRET_KEY = originalKey;
        if (originalFlag === undefined) delete process.env.GATE_PAY_LIVE_CHARGES;
        else process.env.GATE_PAY_LIVE_CHARGES = originalFlag;
      }
    },
    T
  );
});
