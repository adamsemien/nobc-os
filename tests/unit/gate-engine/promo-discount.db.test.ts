/** D6 acceptance - partial-discount promo codes through the PAY verifier, on
 *  real rows against the confirmed dev branch (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  lib/stripe is mocked at the module boundary (Phase E proxy-trap pattern):
 *  the REAL mint route, verifier, and commerce bridge run against a fake
 *  Stripe client - the tests assert the exact stamped metadata, amounts,
 *  refund calls, and DB records without any network.
 *
 *  Directive acceptance items:
 *    1 percent applied - exact cents
 *    2 flat applied - exact cents (schema's fixed type is `flat`)
 *    3 flat > price refused (documented choice: refuse, comp-code copy)
 *    4 expired refused
 *    5 maxUses cap raced - exactly one of two concurrent redemptions lands
 *    6 wrong-event scope refused
 *    7 replay defense intact - plain underpaid rejected; a cross-node
 *      discount stamp never lowers another node's price; a post-charge race
 *      loser is refunded and the proof expires
 *    8 fee math on the discounted base - 2500 with 1500 off -> 1000 ->
 *      gross-up -> total 1061, fee 61; line items sum exactly
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
    metadata: Record<string, string>;
  };
  options: { idempotencyKey?: string };
};
type RefundCall = { params: { payment_intent: string } };

const mockStripeState = {
  createCalls: [] as CreateCall[],
  refundCalls: [] as RefundCall[],
  snapshots: new Map<string, Record<string, unknown>>(),
  seq: 0,
};

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async (params: CreateCall["params"], options: CreateCall["options"]) => {
        mockStripeState.seq += 1;
        const id = `pi_disc_test_${mockStripeState.seq}`;
        mockStripeState.createCalls.push({ params, options });
        return { id, client_secret: `${id}_secret`, status: "requires_payment_method" };
      }),
      retrieve: vi.fn(async (id: string) => mockStripeState.snapshots.get(id) ?? null),
    },
    refunds: {
      create: vi.fn(async (params: RefundCall["params"]) => {
        mockStripeState.refundCalls.push({ params });
        return { id: `re_disc_${mockStripeState.refundCalls.length}` };
      }),
    },
  },
}));

type TokenCtx = { params: Promise<{ token: string }> };
type Route = { POST: (req: Request, ctx: TokenCtx) => Promise<Response> };

let db: PrismaClient;
let engine: GateEngine;
let publicRoute: Route;
let intentRoute: Route;
let world: AcceptanceWorld;
let eventId: string;
let otherEventId: string;
let gateId: string;
let nodeA: string; // 2500
let nodeB: string; // 5000

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
    post(session.token, "", { action: "identify", email, name: "Discount guest" }, ip),
    tokenCtx(session.token)
  );
  expect(res.status).toBe(200);
  return session;
}
function lastCreate(): CreateCall {
  return mockStripeState.createCalls[mockStripeState.createCalls.length - 1];
}
function lastIntentId(): string {
  return `pi_disc_test_${mockStripeState.seq}`;
}
/** Mark the last minted intent succeeded, carrying the REAL mint metadata -
 *  what the verifier will read back from Stripe. */
function succeedLastMint(): string {
  const id = lastIntentId();
  const call = lastCreate();
  mockStripeState.snapshots.set(id, {
    id,
    status: "succeeded",
    amount_received: call.params.amount,
    currency: call.params.currency,
    metadata: call.params.metadata,
  });
  return id;
}
async function makePromo(overrides: {
  code: string;
  discountType: "percent" | "flat" | "comp";
  discountValue: number;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
  validUntil?: Date | null;
  eventId?: string;
}) {
  return db.promoCode.create({
    data: {
      workspaceId: world.workspace.id,
      eventId: overrides.eventId ?? eventId,
      code: overrides.code,
      discountType: overrides.discountType,
      discountValue: overrides.discountValue,
      maxUses: overrides.maxUses ?? null,
      maxUsesPerCustomer: overrides.maxUsesPerCustomer ?? null,
      validUntil: overrides.validUntil ?? null,
    },
  });
}

describeDb("D6 promo discounts (mint + verify + record on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as Route;
    intentRoute = (await import(
      "@/app/api/gate/[token]/payment-intent/route"
    )) as unknown as Route;

    world = await seedAcceptanceWorld(db, "gate-promo-discount");
    eventId = await makeEvent(db, world.workspace.id, "gate-promo-discount-event");
    otherEventId = await makeEvent(db, world.workspace.id, "gate-promo-discount-other");
    const created = await engine.createGate({
      workspaceId: world.workspace.id,
      resource: { type: "EVENT", id: eventId },
      name: "Discount door",
      spec: {
        kind: "GROUP",
        rule: "ANY_N",
        requiredCount: 1,
        children: [
          { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } },
          { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 5000 } },
        ],
      },
    });
    gateId = created.gateId;
    const nodes = await db.gateNode.findMany({
      where: { gateId, conditionType: "PAY" },
      select: { id: true, config: true },
    });
    nodeA = nodes.find((n) => (n.config as { priceCents: number }).priceCents === 2500)!.id;
    nodeB = nodes.find((n) => (n.config as { priceCents: number }).priceCents === 5000)!.id;
  }, 180_000);

  it(
    "acceptance 1: percent applies exactly, stamped server-side, promo in the idempotency key",
    async () => {
      const promo = await makePromo({ code: "TWENTY", discountType: "percent", discountValue: 20 });
      const session = await identifiedSession(world.applicant.email, "10.8.0.1");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "twenty" }, "10.8.0.1"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        clientSecret?: string;
        lineItems?: Record<string, number>;
        promoApplied?: { code: string };
      };
      expect(body.promoApplied).toEqual({ code: "TWENTY" });
      expect(body.lineItems).toEqual({
        subtotalCents: 2500,
        discountCents: 500,
        serviceFeeCents: 0,
        totalCents: 2000,
      });
      const call = lastCreate();
      expect(call.params.amount).toBe(2000);
      expect(call.params.metadata).toMatchObject({
        kind: "gate-pay",
        nodeId: nodeA,
        promoCodeId: promo.id,
        promoCode: "TWENTY",
        baseCents: "2500",
        discountCents: "500",
        discountedCents: "2000",
      });
      expect(call.options.idempotencyKey).toBe(
        `gate-pay:${session.sessionId}:${nodeA}:2000:promo:${promo.id}`
      );
    },
    T
  );

  it(
    "acceptance 2 + 8: flat discount end to end under gross-up - exact cents, honest records",
    async () => {
      await db.event.update({
        where: { id: eventId },
        data: { serviceFeeMode: "pass_stripe_only" },
      });
      try {
        const promo = await makePromo({ code: "FIFTEEN", discountType: "flat", discountValue: 1500 });
        const session = await identifiedSession(world.paidOnlyGuest.email, "10.8.0.2");
        const mint = await intentRoute.POST(
          post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "FIFTEEN" }, "10.8.0.2"),
          tokenCtx(session.token)
        );
        expect(mint.status).toBe(200);
        const body = (await mint.json()) as { lineItems?: Record<string, number> };
        // 2500 - 1500 = 1000 -> gross-up round((1000+30)*1000/971) = 1061.
        expect(body.lineItems).toEqual({
          subtotalCents: 2500,
          discountCents: 1500,
          serviceFeeCents: 61,
          totalCents: 1061,
        });
        const intentId = succeedLastMint();

        const submit = await publicRoute.POST(
          post(
            session.token,
            "",
            { action: "submit", nodeId: nodeA, submission: { paymentIntentId: intentId } },
            "10.8.0.2"
          ),
          tokenCtx(session.token)
        );
        expect(submit.status).toBe(200);
        expect(((await submit.json()) as { open?: boolean }).open).toBe(true);

        const proof = await db.gateProof.findFirst({
          where: { nodeId: nodeA, memberId: world.paidOnlyGuest.id },
        });
        expect(proof?.status).toBe("SATISFIED");
        expect(proof?.mechanism).toBe("STRIPE_PAYMENT");
        expect(proof?.payload).toMatchObject({
          paymentIntentId: intentId,
          amountReceived: 1061,
          promoCodeId: promo.id,
          baseCents: 2500,
          discountCents: 1500,
        });

        const order = await db.order.findFirst({
          where: { workspaceId: world.workspace.id, stripePaymentIntentId: intentId },
        });
        expect(order).toMatchObject({
          subtotalCents: 2500,
          promoDiscountCents: 1500,
          serviceFeeCents: 61,
          totalCents: 1061,
          promoCodeId: promo.id,
          paymentStatus: "CAPTURED",
        });
        const redemption = await db.promoRedemption.findFirst({
          where: { workspaceId: world.workspace.id, promoCodeId: promo.id },
        });
        expect(redemption).toMatchObject({
          orderId: order!.id,
          amountSavedCents: 1500,
        });
        const after = await db.promoCode.findUnique({ where: { id: promo.id } });
        expect(after?.usedCount).toBe(1);
      } finally {
        await db.event.update({
          where: { id: eventId },
          data: { serviceFeeMode: "absorb" },
        });
      }
    },
    T
  );

  it(
    "acceptance 3: a flat discount at or above the price is refused with comp-code copy",
    async () => {
      await makePromo({ code: "TOOBIG", discountType: "flat", discountValue: 3000 });
      const session = await identifiedSession(world.attendee.email, "10.8.0.3");
      const mintsBefore = mockStripeState.createCalls.length;
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "TOOBIG" }, "10.8.0.3"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("comp code");
      expect(mockStripeState.createCalls.length).toBe(mintsBefore);
    },
    T
  );

  it(
    "acceptance 4: an expired code declines with the generic line",
    async () => {
      await makePromo({
        code: "BYGONE",
        discountType: "percent",
        discountValue: 10,
        validUntil: new Date(Date.now() - 60_000),
      });
      const session = await identifiedSession(world.staleApplicant.email, "10.8.0.4");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "BYGONE" }, "10.8.0.4"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error?: string }).error).toBe(
        "That code did not work. Check it and try again."
      );
    },
    T
  );

  it(
    "acceptance 6: a code scoped to another event never redeems here",
    async () => {
      await makePromo({
        code: "ELSEWHERE",
        discountType: "percent",
        discountValue: 10,
        eventId: otherEventId,
      });
      const session = await identifiedSession(world.unclearApplicant.email, "10.8.0.5");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "ELSEWHERE" }, "10.8.0.5"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error?: string }).error).toBe(
        "That code did not work. Check it and try again."
      );
    },
    T
  );

  it(
    "D6-1 routing: a comp-class code entered as a discount reports compCode and mints nothing",
    async () => {
      await makePromo({ code: "FULLRIDE", discountType: "comp", discountValue: 100 });
      const session = await identifiedSession(world.referrer.email, "10.8.0.6");
      const mintsBefore = mockStripeState.createCalls.length;
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "FULLRIDE" }, "10.8.0.6"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { compCode?: boolean }).compCode).toBe(true);
      expect(mockStripeState.createCalls.length).toBe(mintsBefore);
    },
    T
  );

  it(
    "acceptance 7a: replay defense intact - a plain underpaid intent is rejected at full price",
    async () => {
      const session = await identifiedSession("plain-underpay@example.com", "10.8.0.7");
      await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA }, "10.8.0.7"),
        tokenCtx(session.token)
      );
      const intentId = lastIntentId();
      const call = lastCreate();
      mockStripeState.snapshots.set(intentId, {
        id: intentId,
        status: "succeeded",
        amount_received: 100,
        currency: "usd",
        metadata: call.params.metadata,
      });
      const submit = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "submit", nodeId: nodeA, submission: { paymentIntentId: intentId } },
          "10.8.0.7"
        ),
        tokenCtx(session.token)
      );
      expect(submit.status).toBe(200);
      const member = await db.member.findFirst({
        where: { workspaceId: world.workspace.id, email: "plain-underpay@example.com" },
        select: { id: true },
      });
      const proof = await db.gateProof.findFirst({
        where: { nodeId: nodeA, memberId: member!.id },
      });
      expect(proof?.status).toBe("REJECTED");
    },
    T
  );

  it(
    "acceptance 7b: a discounted intent minted for the cheap node never satisfies the dear one",
    async () => {
      await makePromo({ code: "CROSSNODE", discountType: "percent", discountValue: 20 });
      const session = await identifiedSession(world.referredGuest.email, "10.8.0.8");
      const mint = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: nodeA, promoCode: "CROSSNODE" }, "10.8.0.8"),
        tokenCtx(session.token)
      );
      expect(mint.status).toBe(200);
      const intentId = succeedLastMint(); // 2000 received, stamped for nodeA

      const submit = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "submit", nodeId: nodeB, submission: { paymentIntentId: intentId } },
          "10.8.0.8"
        ),
        tokenCtx(session.token)
      );
      expect(submit.status).toBe(200);
      const proof = await db.gateProof.findFirst({
        where: { nodeId: nodeB, memberId: world.referredGuest.id },
      });
      // 2000 received < 5000 required - the foreign-node stamp never lowered it.
      expect(proof?.status).toBe("REJECTED");
    },
    T
  );

  it(
    "acceptance 5: two concurrent redemptions of the last use - exactly one lands",
    async () => {
      const { recordPaidAdmission, PromoExhaustedError } = await import("@/lib/commerce/orders");
      const promo = await makePromo({
        code: "LASTONE",
        discountType: "percent",
        discountValue: 50,
        maxUses: 1,
      });
      const results = await Promise.allSettled([
        recordPaidAdmission(db, {
          workspaceId: world.workspace.id,
          eventId,
          member: world.referrer,
          paymentIntentId: "pi_disc_race_a",
          subtotalCents: 2500,
          amountReceivedCents: 1250,
          currency: "usd",
          gateSessionId: null,
          promo: { promoCodeId: promo.id, discountCents: 1250 },
        }),
        recordPaidAdmission(db, {
          workspaceId: world.workspace.id,
          eventId,
          member: world.attendee,
          paymentIntentId: "pi_disc_race_b",
          subtotalCents: 2500,
          amountReceivedCents: 1250,
          currency: "usd",
          gateSessionId: null,
          promo: { promoCodeId: promo.id, discountCents: 1250 },
        }),
      ]);
      const landed = results.filter((r) => r.status === "fulfilled");
      const lost = results.filter((r) => r.status === "rejected");
      expect(landed).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(PromoExhaustedError);

      const after = await db.promoCode.findUnique({ where: { id: promo.id } });
      expect(after?.usedCount).toBe(1);
      expect(
        await db.promoRedemption.count({
          where: { workspaceId: world.workspace.id, promoCodeId: promo.id },
        })
      ).toBe(1);
    },
    T
  );

  it(
    "acceptance 7c: a post-charge race loser is refunded and the proof expires",
    async () => {
      const promo = await makePromo({
        code: "LASTPAIR",
        discountType: "percent",
        discountValue: 50,
        maxUses: 1,
      });
      // Both guests mint BEFORE either lands - both pass the non-atomic
      // pre-check, which is exactly the window the claim must close.
      const winner = await identifiedSession(world.revocable.email, "10.8.0.9");
      await intentRoute.POST(
        post(winner.token, "/payment-intent", { nodeId: nodeA, promoCode: "LASTPAIR" }, "10.8.0.9"),
        tokenCtx(winner.token)
      );
      const winnerIntent = succeedLastMint();

      const loser = await identifiedSession("promo-race-loser@example.com", "10.8.0.10");
      await intentRoute.POST(
        post(loser.token, "/payment-intent", { nodeId: nodeA, promoCode: "LASTPAIR" }, "10.8.0.10"),
        tokenCtx(loser.token)
      );
      const loserIntent = succeedLastMint();

      const winnerSubmit = await publicRoute.POST(
        post(
          winner.token,
          "",
          { action: "submit", nodeId: nodeA, submission: { paymentIntentId: winnerIntent } },
          "10.8.0.9"
        ),
        tokenCtx(winner.token)
      );
      expect(winnerSubmit.status).toBe(200);

      const refundsBefore = mockStripeState.refundCalls.length;
      const loserSubmit = await publicRoute.POST(
        post(
          loser.token,
          "",
          { action: "submit", nodeId: nodeA, submission: { paymentIntentId: loserIntent } },
          "10.8.0.10"
        ),
        tokenCtx(loser.token)
      );
      expect(loserSubmit.status).toBe(200);

      // The loser's charge came back and the proof cannot hold the door open.
      expect(mockStripeState.refundCalls.length).toBe(refundsBefore + 1);
      expect(
        mockStripeState.refundCalls[mockStripeState.refundCalls.length - 1].params.payment_intent
      ).toBe(loserIntent);
      const loserMember = await db.member.findFirst({
        where: { workspaceId: world.workspace.id, email: "promo-race-loser@example.com" },
        select: { id: true },
      });
      const loserProof = await db.gateProof.findFirst({
        where: { nodeId: nodeA, memberId: loserMember!.id },
      });
      expect(loserProof?.expiresAt).not.toBeNull();
      expect(loserProof!.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(
        await db.order.findFirst({
          where: { workspaceId: world.workspace.id, stripePaymentIntentId: loserIntent },
        })
      ).toBeNull();
      // The stale open decision must not hand the refunded loser a free
      // confirmed seat on the door list.
      expect(
        await db.rSVP.findFirst({
          where: {
            workspaceId: world.workspace.id,
            eventId,
            memberId: loserMember!.id,
            ticketStatus: "confirmed",
          },
        })
      ).toBeNull();
      const after = await db.promoCode.findUnique({ where: { id: promo.id } });
      expect(after?.usedCount).toBe(1);
    },
    T
  );

  it(
    "per-customer cap: a second redemption by the same member is refused at mint",
    async () => {
      const { checkDiscountCode } = await import("@/lib/commerce/promo-codes");
      const promo = await makePromo({
        code: "ONEEACH",
        discountType: "percent",
        discountValue: 10,
        maxUsesPerCustomer: 1,
      });
      const { recordPaidAdmission } = await import("@/lib/commerce/orders");
      await recordPaidAdmission(db, {
        workspaceId: world.workspace.id,
        eventId,
        member: world.staleApplicant,
        paymentIntentId: "pi_disc_percust",
        subtotalCents: 2500,
        amountReceivedCents: 2250,
        currency: "usd",
        gateSessionId: null,
        promo: { promoCodeId: promo.id, discountCents: 250 },
      });
      const again = await checkDiscountCode(db, {
        workspaceId: world.workspace.id,
        eventId,
        seriesId: null,
        memberId: world.staleApplicant.id,
        code: "ONEEACH",
        baseCents: 2500,
      });
      expect(again).toEqual({ ok: false, reason: "exhausted" });
    },
    T
  );

  // ── Loose Ends L7: series-scoped codes at gates ────────────────────────────

  type SeriesWorld = {
    seriesId: string;
    otherSeriesId: string;
    inSeriesEventId: string;
    inSeriesGateId: string;
    inSeriesNodeId: string;
    strayEventId: string;
    strayGateId: string;
    strayNodeId: string;
  };
  let seriesWorld: SeriesWorld | null = null;

  async function seedSeries(): Promise<SeriesWorld> {
    if (seriesWorld) return seriesWorld;
    const mkSeries = (name: string) =>
      db.eventSeries.create({
        data: {
          workspaceId: world.workspace.id,
          name,
          recurrenceRule: "FREQ=WEEKLY",
          startsAt: new Date("2026-08-01T20:00:00Z"),
        },
        select: { id: true },
      });
    const series = await mkSeries("Promo Series");
    const otherSeries = await mkSeries("Other Series");
    const inSeriesEventId = await makeEvent(db, world.workspace.id, "gate-promo-series-event");
    const strayEventId = await makeEvent(db, world.workspace.id, "gate-promo-series-stray");
    await db.event.update({ where: { id: inSeriesEventId }, data: { seriesId: series.id } });
    await db.event.update({ where: { id: strayEventId }, data: { seriesId: otherSeries.id } });

    const mkGate = async (eid: string) => {
      const created = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eid },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } }],
        },
      });
      const node = await db.gateNode.findFirst({
        where: { gateId: created.gateId, conditionType: "PAY" },
        select: { id: true },
      });
      return { gateId: created.gateId, nodeId: node!.id };
    };
    const inGate = await mkGate(inSeriesEventId);
    const strayGate = await mkGate(strayEventId);
    seriesWorld = {
      seriesId: series.id,
      otherSeriesId: otherSeries.id,
      inSeriesEventId,
      inSeriesGateId: inGate.gateId,
      inSeriesNodeId: inGate.nodeId,
      strayEventId,
      strayGateId: strayGate.gateId,
      strayNodeId: strayGate.nodeId,
    };
    return seriesWorld;
  }

  async function sessionOn(gid: string, email: string, ip: string) {
    const session = await engine.createSession({ workspaceId: world.workspace.id, gateId: gid });
    const res = await publicRoute.POST(
      post(session.token, "", { action: "identify", email, name: "Series guest" }, ip),
      tokenCtx(session.token)
    );
    expect(res.status).toBe(200);
    return session;
  }

  it(
    "L7: a series-scoped code redeems on an event in the series - stamped like any discount",
    async () => {
      const sw = await seedSeries();
      const promo = await db.promoCode.create({
        data: {
          workspaceId: world.workspace.id,
          seriesId: sw.seriesId,
          code: "SEASON20",
          discountType: "percent",
          discountValue: 20,
        },
      });
      const session = await sessionOn(sw.inSeriesGateId, world.applicant.email, "10.9.0.1");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: sw.inSeriesNodeId, promoCode: "season20" }, "10.9.0.1"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lineItems?: Record<string, number> };
      expect(body.lineItems).toEqual({
        subtotalCents: 2500,
        discountCents: 500,
        serviceFeeCents: 0,
        totalCents: 2000,
      });
      const call = lastCreate();
      expect(call.params.metadata).toMatchObject({
        nodeId: sw.inSeriesNodeId,
        promoCodeId: promo.id,
        baseCents: "2500",
        discountCents: "500",
        discountedCents: "2000",
      });
    },
    T
  );

  it(
    "L7: scope refusal - a series code never redeems outside its series, nor on a series-less event",
    async () => {
      const sw = await seedSeries();
      // Route level: the stray event lives in a DIFFERENT series.
      const session = await sessionOn(sw.strayGateId, world.paidOnlyGuest.email, "10.9.0.2");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: sw.strayNodeId, promoCode: "SEASON20" }, "10.9.0.2"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(409);

      // Direct check: an event with no series at all never matches a series code.
      const { checkDiscountCode } = await import("@/lib/commerce/promo-codes");
      const check = await checkDiscountCode(db, {
        workspaceId: world.workspace.id,
        eventId: otherEventId,
        seriesId: null,
        memberId: world.paidOnlyGuest.id,
        code: "SEASON20",
        baseCents: 2500,
      });
      expect(check).toEqual({ ok: false, reason: "not_found" });
    },
    T
  );

  it(
    "L7: on a code-string collision the event-scoped code wins",
    async () => {
      const sw = await seedSeries();
      await db.promoCode.create({
        data: {
          workspaceId: world.workspace.id,
          seriesId: sw.seriesId,
          code: "CLASH",
          discountType: "percent",
          discountValue: 20,
        },
      });
      await db.promoCode.create({
        data: {
          workspaceId: world.workspace.id,
          eventId: sw.inSeriesEventId,
          code: "CLASH",
          discountType: "percent",
          discountValue: 10,
        },
      });
      const session = await sessionOn(sw.inSeriesGateId, world.attendee.email, "10.9.0.3");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: sw.inSeriesNodeId, promoCode: "CLASH" }, "10.9.0.3"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { lineItems?: Record<string, number> };
      expect(body.lineItems?.discountCents).toBe(250); // 10%, the event's own code
    },
    T
  );

  it(
    "L7: the last use of a series code races - exactly one lands",
    async () => {
      const sw = await seedSeries();
      const { recordPaidAdmission, PromoExhaustedError } = await import("@/lib/commerce/orders");
      const promo = await db.promoCode.create({
        data: {
          workspaceId: world.workspace.id,
          seriesId: sw.seriesId,
          code: "SERIESLAST",
          discountType: "percent",
          discountValue: 50,
          maxUses: 1,
        },
      });
      const admit = (member: typeof world.referrer, intent: string) =>
        recordPaidAdmission(db, {
          workspaceId: world.workspace.id,
          eventId: sw.inSeriesEventId,
          member,
          paymentIntentId: intent,
          subtotalCents: 2500,
          amountReceivedCents: 1250,
          currency: "usd",
          gateSessionId: null,
          promo: { promoCodeId: promo.id, discountCents: 1250 },
        });
      const results = await Promise.allSettled([
        admit(world.referrer, "pi_series_race_a"),
        admit(world.attendee, "pi_series_race_b"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = results.filter((r) => r.status === "rejected");
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(PromoExhaustedError);
      const after = await db.promoCode.findUnique({ where: { id: promo.id } });
      expect(after?.usedCount).toBe(1);
    },
    T
  );
});
