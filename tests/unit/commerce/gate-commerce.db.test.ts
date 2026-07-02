/** Phase A acceptance - the commerce spine on real rows (env-gated:
 *  GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  Acceptance 4: PAY -> (fake) Stripe intent -> Order + Ticket written ->
 *  door list shows the ticket.
 *  Acceptance 5: 100%-off comp code -> zero Stripe contact -> honest
 *  COMP_CODE proof -> real Ticket -> door list.
 *  Acceptance 6: the service-fee toggle changes the charged amount with a
 *  transparent line item; absorb charges the flat price.
 *
 *  Same harness as gate-engine/pay-flow.db.test.ts: lib/stripe is mocked at
 *  the module boundary, the REAL routes + engine + bridge run on real rows.
 */
import "../gate-engine/helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import {
  makeEvent,
  seedAcceptanceWorld,
  type AcceptanceWorld,
} from "../gate-engine/helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

type CreateCall = {
  params: { amount: number; currency: string; metadata: Record<string, string> };
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
        const id = `pi_commerce_test_${mockStripeState.seq}`;
        mockStripeState.createCalls.push({ params, options });
        return { id, client_secret: `${id}_secret`, status: "requires_payment_method" };
      }),
      retrieve: vi.fn(async (id: string) => mockStripeState.snapshots.get(id) ?? null),
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
let feeEventId: string; // pass_stripe_only, $25.00
let feeGateId: string;
let feePayNodeId: string;
let absorbEventId: string; // absorb (default), $25.00
let absorbGateId: string;
let absorbPayNodeId: string;

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
async function identifiedSession(gateId: string, email: string, ip: string) {
  const session = await engine.createSession({ workspaceId: world.workspace.id, gateId });
  const res = await publicRoute.POST(
    post(session.token, "", { action: "identify", email, name: "Commerce guest" }, ip),
    tokenCtx(session.token)
  );
  expect(res.status).toBe(200);
  return session;
}
function lastCreate(): CreateCall {
  return mockStripeState.createCalls[mockStripeState.createCalls.length - 1];
}
/** The exact door-list filter (app/api/check-in/event/route.ts). */
function doorListCount(eventId: string, memberId: string): Promise<number> {
  return db.rSVP.count({
    where: {
      workspaceId: world.workspace.id,
      eventId,
      memberId,
      ticketStatus: { in: ["confirmed", "held"] },
    },
  });
}

async function makePayGate(eventId: string) {
  const created = await engine.createGate({
    workspaceId: world.workspace.id,
    resource: { type: "EVENT", id: eventId },
    name: "Commerce door",
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
  return { gateId: created.gateId, payNodeId: node!.id };
}

describeDb("Phase A commerce spine (fees + orders + comp on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as Route;
    intentRoute = (await import(
      "@/app/api/gate/[token]/payment-intent/route"
    )) as unknown as Route;

    world = await seedAcceptanceWorld(db, "gate-commerce");

    feeEventId = await makeEvent(db, world.workspace.id, "gate-commerce-fee-event");
    await db.event.update({
      where: { id: feeEventId },
      data: { serviceFeeMode: "pass_stripe_only" },
    });
    ({ gateId: feeGateId, payNodeId: feePayNodeId } = await makePayGate(feeEventId));

    absorbEventId = await makeEvent(db, world.workspace.id, "gate-commerce-absorb-event");
    ({ gateId: absorbGateId, payNodeId: absorbPayNodeId } = await makePayGate(absorbEventId));

    await db.promoCode.create({
      data: {
        workspaceId: world.workspace.id,
        eventId: feeEventId,
        code: "HOUSELIST",
        discountType: "comp",
        discountValue: 100,
        maxUses: 5,
      },
    });
  }, 180_000);

  it(
    "acceptance 6: pass_stripe_only mints the grossed-up total with transparent line items",
    async () => {
      const session = await identifiedSession(feeGateId, world.applicant.email, "10.7.0.1");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: feePayNodeId }, "10.7.0.1"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        clientSecret?: string;
        lineItems?: { subtotalCents: number; serviceFeeCents: number; totalCents: number };
      };
      expect(body.lineItems).toMatchObject({
        subtotalCents: 2500,
        serviceFeeCents: 106,
        totalCents: 2606,
      });
      const call = lastCreate();
      expect(call.params.amount).toBe(2606);
      expect(call.params.metadata).toMatchObject({
        subtotalCents: "2500",
        serviceFeeCents: "106",
      });
      expect(call.options.idempotencyKey).toBe(
        `gate-pay:${session.sessionId}:${feePayNodeId}:2606`
      );
    },
    T
  );

  it(
    "acceptance 6: absorb charges the flat price, fee zero",
    async () => {
      const session = await identifiedSession(absorbGateId, world.attendee.email, "10.7.0.2");
      const res = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: absorbPayNodeId }, "10.7.0.2"),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        lineItems?: { serviceFeeCents: number; totalCents: number };
      };
      expect(body.lineItems).toMatchObject({ serviceFeeCents: 0, totalCents: 2500 });
      expect(lastCreate().params.amount).toBe(2500);
    },
    T
  );

  it(
    "acceptance 4: a succeeded PAY writes Order + Ticket + confirmed RSVP on the door list, idempotently",
    async () => {
      const session = await identifiedSession(feeGateId, world.paidOnlyGuest.email, "10.7.0.3");
      const mint = await intentRoute.POST(
        post(session.token, "/payment-intent", { nodeId: feePayNodeId }, "10.7.0.3"),
        tokenCtx(session.token)
      );
      expect(mint.status).toBe(200);
      const intentId = `pi_commerce_test_${mockStripeState.seq}`;
      mockStripeState.snapshots.set(intentId, {
        id: intentId,
        status: "succeeded",
        amount_received: 2606,
        currency: "usd",
        metadata: { memberId: world.paidOnlyGuest.id },
      });

      const submit = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "submit", nodeId: feePayNodeId, submission: { paymentIntentId: intentId } },
          "10.7.0.3"
        ),
        tokenCtx(session.token)
      );
      expect(submit.status).toBe(200);
      expect(((await submit.json()) as { open?: boolean }).open).toBe(true);

      const order = await db.order.findFirst({
        where: { workspaceId: world.workspace.id, stripePaymentIntentId: intentId },
      });
      expect(order).toMatchObject({
        eventId: feeEventId,
        buyerMemberId: world.paidOnlyGuest.id,
        subtotalCents: 2500,
        serviceFeeCents: 106,
        promoDiscountCents: 0,
        totalCents: 2606,
        paymentStatus: "CAPTURED",
      });
      const ticket = await db.ticket.findFirst({
        where: { workspaceId: world.workspace.id, stripePaymentIntentId: intentId },
      });
      expect(ticket).toMatchObject({
        eventId: feeEventId,
        memberId: world.paidOnlyGuest.id,
        amount: 2606,
        status: "CAPTURED",
      });
      const rsvp = await db.rSVP.findFirst({
        where: { id: ticket!.rsvpId },
      });
      expect(rsvp).toMatchObject({
        eventId: feeEventId,
        memberId: world.paidOnlyGuest.id,
        ticketStatus: "confirmed",
        paymentStatus: "CAPTURED",
        amountCents: 2606,
        orderId: order!.id,
      });
      expect(await doorListCount(feeEventId, world.paidOnlyGuest.id)).toBe(1);

      // Re-submit of the same intent: no duplicate money records.
      const again = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "submit", nodeId: feePayNodeId, submission: { paymentIntentId: intentId } },
          "10.7.0.3"
        ),
        tokenCtx(session.token)
      );
      expect(again.status).toBe(200);
      expect(
        await db.order.count({
          where: { workspaceId: world.workspace.id, stripePaymentIntentId: intentId },
        })
      ).toBe(1);
      expect(
        await db.ticket.count({
          where: { workspaceId: world.workspace.id, stripePaymentIntentId: intentId },
        })
      ).toBe(1);
    },
    T
  );

  it(
    "acceptance 5: a comp code opens the gate with zero Stripe contact and real records",
    async () => {
      const session = await identifiedSession(feeGateId, world.referrer.email, "10.7.0.4");
      const createsBefore = mockStripeState.createCalls.length;

      const res = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "redeem_comp", nodeId: feePayNodeId, code: "houselist" },
          "10.7.0.4"
        ),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const view = (await res.json()) as { open?: boolean; notice?: string };
      expect(view.open).toBe(true);
      expect(view.notice).toBeUndefined();
      expect(mockStripeState.createCalls.length).toBe(createsBefore); // zero Stripe

      const proof = await db.gateProof.findFirst({
        where: { nodeId: feePayNodeId, memberId: world.referrer.id },
      });
      expect(proof?.status).toBe("SATISFIED");
      expect(proof?.mechanism).toBe("COMP_CODE");
      expect(proof?.tier).toBe("FIRST_PARTY");
      expect((proof?.payload as { promoCode?: string })?.promoCode).toBe("HOUSELIST");

      const order = await db.order.findFirst({
        where: {
          workspaceId: world.workspace.id,
          eventId: feeEventId,
          buyerMemberId: world.referrer.id,
        },
        include: { redemptions: true },
      });
      expect(order).toMatchObject({
        subtotalCents: 2500,
        promoDiscountCents: 2500,
        serviceFeeCents: 0,
        totalCents: 0,
        stripePaymentIntentId: null,
      });
      expect(order?.redemptions).toHaveLength(1);
      expect(order?.redemptions[0].amountSavedCents).toBe(2500);

      const ticket = await db.ticket.findFirst({
        where: {
          workspaceId: world.workspace.id,
          eventId: feeEventId,
          memberId: world.referrer.id,
        },
      });
      expect(ticket).toMatchObject({ amount: 0, status: "CAPTURED" });

      const rsvp = await db.rSVP.findFirst({ where: { id: ticket!.rsvpId } });
      expect(rsvp).toMatchObject({ ticketStatus: "confirmed", paymentStatus: "COMP" });
      expect(await doorListCount(feeEventId, world.referrer.id)).toBe(1);

      const promo = await db.promoCode.findFirst({
        where: { workspaceId: world.workspace.id, code: "HOUSELIST" },
      });
      expect(promo?.usedCount).toBe(1);

      // Re-redeem: idempotent, no double-count.
      const again = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "redeem_comp", nodeId: feePayNodeId, code: "HOUSELIST" },
          "10.7.0.4"
        ),
        tokenCtx(session.token)
      );
      expect(again.status).toBe(200);
      expect(
        await db.order.count({
          where: {
            workspaceId: world.workspace.id,
            eventId: feeEventId,
            buyerMemberId: world.referrer.id,
          },
        })
      ).toBe(1);
      const promoAfter = await db.promoCode.findFirst({
        where: { workspaceId: world.workspace.id, code: "HOUSELIST" },
      });
      expect(promoAfter?.usedCount).toBe(1);
    },
    T
  );

  it(
    "a wrong code declines with one generic notice and writes nothing",
    async () => {
      const session = await identifiedSession(feeGateId, world.revocable.email, "10.7.0.5");
      const res = await publicRoute.POST(
        post(
          session.token,
          "",
          { action: "redeem_comp", nodeId: feePayNodeId, code: "NOT-A-CODE" },
          "10.7.0.5"
        ),
        tokenCtx(session.token)
      );
      expect(res.status).toBe(200);
      const view = (await res.json()) as { open?: boolean; notice?: string };
      expect(view.open).toBe(false);
      expect(view.notice).toBe("That code did not work. Check it and try again.");
      expect(
        await db.gateProof.count({
          where: { nodeId: feePayNodeId, memberId: world.revocable.id },
        })
      ).toBe(0);
      expect(
        await db.order.count({
          where: {
            workspaceId: world.workspace.id,
            eventId: feeEventId,
            buyerMemberId: world.revocable.id,
          },
        })
      ).toBe(0);
    },
    T
  );
});
