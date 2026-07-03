/** Phase C acceptance - refund revokes proof on real rows (env-gated:
 *  GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  Acceptance 7: a FULL refund expires the PAY GateProof, closes the Order +
 *  Ticket, and removes the buyer from the door list; a partial refund keeps
 *  the seat and the proof; mass refund dry-runs correctly and executes
 *  idempotently. Stripe is mocked at the module boundary; the real gate
 *  routes, engine, bridge, and refund machine run on real rows.
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

const mockStripeState = {
  snapshots: new Map<string, Record<string, unknown>>(),
  refunds: [] as { payment_intent: string; amount?: number; key?: string }[],
  seq: 0,
};

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async (params: { amount: number }) => {
        mockStripeState.seq += 1;
        const id = `pi_refund_test_${mockStripeState.seq}`;
        return { id, client_secret: `${id}_secret`, status: "requires_payment_method", amount: params.amount };
      }),
      retrieve: vi.fn(async (id: string) => mockStripeState.snapshots.get(id) ?? null),
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    refunds: {
      create: vi.fn(
        async (
          params: { payment_intent: string; amount?: number },
          opts: { idempotencyKey?: string },
        ) => {
          const intent = mockStripeState.snapshots.get(params.payment_intent) as
            | { amount_received: number }
            | undefined;
          const amount = params.amount ?? intent?.amount_received ?? 0;
          mockStripeState.refunds.push({
            payment_intent: params.payment_intent,
            amount: params.amount,
            key: opts.idempotencyKey,
          });
          return { id: `re_${mockStripeState.refunds.length}`, amount };
        },
      ),
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

/** Full paid walkthrough for one member; returns the intent id + rsvp id. */
async function buyTicket(email: string, ip: string) {
  const session = await engine.createSession({ workspaceId: world.workspace.id, gateId });
  const identify = await publicRoute.POST(
    post(session.token, "", { action: "identify", email, name: "Refund guest" }, ip),
    tokenCtx(session.token),
  );
  expect(identify.status).toBe(200);
  const mint = await intentRoute.POST(
    post(session.token, "/payment-intent", { nodeId: payNodeId }, ip),
    tokenCtx(session.token),
  );
  expect(mint.status).toBe(200);
  const intentId = `pi_refund_test_${mockStripeState.seq}`;
  const member = await db.member.findFirst({
    where: { workspaceId: world.workspace.id, email },
    select: { id: true },
  });
  mockStripeState.snapshots.set(intentId, {
    id: intentId,
    status: "succeeded",
    amount_received: 2500,
    currency: "usd",
    metadata: { memberId: member!.id },
  });
  const submit = await publicRoute.POST(
    post(
      session.token,
      "",
      { action: "submit", nodeId: payNodeId, submission: { paymentIntentId: intentId } },
      ip,
    ),
    tokenCtx(session.token),
  );
  expect(submit.status).toBe(200);
  const rsvp = await db.rSVP.findFirst({
    where: { workspaceId: world.workspace.id, eventId, memberId: member!.id },
    select: { id: true },
  });
  return { intentId, rsvpId: rsvp!.id, memberId: member!.id };
}

function doorListCount(memberId: string): Promise<number> {
  return db.rSVP.count({
    where: {
      workspaceId: world.workspace.id,
      eventId,
      memberId,
      ticketStatus: { in: ["confirmed", "held"] },
    },
  });
}

describeDb("Phase C - refund revokes proof (acceptance 7)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as Route;
    intentRoute = (await import(
      "@/app/api/gate/[token]/payment-intent/route"
    )) as unknown as Route;

    world = await seedAcceptanceWorld(db, "gate-refunds");
    eventId = await makeEvent(db, world.workspace.id, "gate-refunds-event");
    const created = await engine.createGate({
      workspaceId: world.workspace.id,
      resource: { type: "EVENT", id: eventId },
      name: "Refund door",
      spec: {
        kind: "GROUP",
        rule: "ALL",
        children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } }],
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
    "full refund: proof expired, Order/Ticket REFUNDED, buyer off the door list",
    async () => {
      const { refundRsvp } = await import("@/lib/commerce/refund");
      const { isProofLive } = await import("@/lib/gate-engine/proofs");
      const buyer = await buyTicket(world.applicant.email, "10.6.0.1");
      expect(await doorListCount(buyer.memberId)).toBe(1);

      const outcome = await refundRsvp({
        workspaceId: world.workspace.id,
        actorId: "op-test",
        rsvpId: buyer.rsvpId,
        db,
      });
      expect(outcome).toMatchObject({ ok: true, fully: true, thisRefundCents: 2500 });

      const rsvp = await db.rSVP.findUnique({
        where: { id: buyer.rsvpId },
        select: { paymentStatus: true, ticketStatus: true, refundedAt: true },
      });
      expect(rsvp).toMatchObject({ paymentStatus: "REFUNDED", ticketStatus: "refunded" });
      expect(rsvp?.refundedAt).not.toBeNull();
      expect(await doorListCount(buyer.memberId)).toBe(0);

      const order = await db.order.findFirst({
        where: { workspaceId: world.workspace.id, stripePaymentIntentId: buyer.intentId },
        select: { paymentStatus: true },
      });
      expect(order?.paymentStatus).toBe("REFUNDED");
      const ticket = await db.ticket.findFirst({
        where: { workspaceId: world.workspace.id, stripePaymentIntentId: buyer.intentId },
        select: { status: true },
      });
      expect(ticket?.status).toBe("REFUNDED");

      const proof = await db.gateProof.findFirst({
        where: { nodeId: payNodeId, memberId: buyer.memberId },
        select: { status: true, expiresAt: true },
      });
      expect(proof?.expiresAt).not.toBeNull();
      expect(isProofLive(proof!, new Date())).toBe(false);
    },
    T,
  );

  it(
    "partial refund keeps the seat and the proof",
    async () => {
      const { refundRsvp } = await import("@/lib/commerce/refund");
      const { isProofLive } = await import("@/lib/gate-engine/proofs");
      const buyer = await buyTicket(world.attendee.email, "10.6.0.2");

      const outcome = await refundRsvp({
        workspaceId: world.workspace.id,
        actorId: "op-test",
        rsvpId: buyer.rsvpId,
        amountCents: 1000,
        db,
      });
      expect(outcome).toMatchObject({ ok: true, fully: false, thisRefundCents: 1000 });

      const rsvp = await db.rSVP.findUnique({
        where: { id: buyer.rsvpId },
        select: { paymentStatus: true, ticketStatus: true, refundAmountCents: true },
      });
      expect(rsvp).toMatchObject({
        paymentStatus: "PARTIALLY_REFUNDED",
        ticketStatus: "confirmed",
        refundAmountCents: 1000,
      });
      expect(await doorListCount(buyer.memberId)).toBe(1);

      const proof = await db.gateProof.findFirst({
        where: { nodeId: payNodeId, memberId: buyer.memberId },
        select: { status: true, expiresAt: true },
      });
      expect(isProofLive(proof!, new Date())).toBe(true);
    },
    T,
  );

  it(
    "mass refund: correct dry-run, idempotent execute via the shared machine",
    async () => {
      const { listRefundableRsvps, refundRsvp, remainingRefundableCents } = await import(
        "@/lib/commerce/refund"
      );
      // Two fresh buyers on top of the partially-refunded attendee.
      const b1 = await buyTicket(world.referrer.email, "10.6.0.3");
      const b2 = await buyTicket(world.paidOnlyGuest.email, "10.6.0.4");

      const refundable = await listRefundableRsvps(db, {
        workspaceId: world.workspace.id,
        eventId,
      });
      // applicant is fully refunded (excluded); attendee is partial (included).
      const ids = refundable.map((r) => r.id).sort();
      expect(ids).toHaveLength(3);
      const total = refundable.reduce((s, r) => s + remainingRefundableCents(r), 0);
      expect(total).toBe(2500 + 2500 + 1500);

      // Execute all three; then a re-run finds zero refundable rows.
      for (const r of refundable) {
        const out = await refundRsvp({
          workspaceId: world.workspace.id,
          actorId: "op-test",
          rsvpId: r.id,
          db,
        });
        expect(out.ok).toBe(true);
      }
      expect(
        await listRefundableRsvps(db, { workspaceId: world.workspace.id, eventId }),
      ).toHaveLength(0);
      expect(await doorListCount(b1.memberId)).toBe(0);
      expect(await doorListCount(b2.memberId)).toBe(0);

      // Idempotency: re-refunding an already-refunded row is a clean 409.
      const again = await refundRsvp({
        workspaceId: world.workspace.id,
        actorId: "op-test",
        rsvpId: b1.rsvpId,
        db,
      });
      expect(again).toMatchObject({ ok: false, status: 409 });
    },
    T,
  );
});
