/** Phase F acceptance - the mid-run addendum on real rows (env-gated:
 *  GATE_M1_DB_TESTS=1, ep-sweet-term).
 *
 *  Acceptance 10: checkout captures the three consent signals correctly and
 *  checking nothing still buys. Acceptance 11: the confirmation email sends
 *  on paid AND comp orders, exactly once. Acceptance 12: a buyer at cap sees
 *  sold out and no Order is written - including the race where the charge
 *  landed before the cap did (auto-refund). Acceptance 13: a PAY node
 *  outside its window or at its cap is not offered and the mint route
 *  refuses server-side.
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
  createCalls: [] as { amount: number }[],
  snapshots: new Map<string, Record<string, unknown>>(),
  refunds: [] as { payment_intent: string; key?: string }[],
  seq: 0,
};
vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async (params: { amount: number }) => {
        mockStripeState.seq += 1;
        const id = `pi_addendum_${mockStripeState.seq}`;
        mockStripeState.createCalls.push(params);
        return { id, client_secret: `${id}_secret`, status: "requires_payment_method" };
      }),
      retrieve: vi.fn(async (id: string) => mockStripeState.snapshots.get(id) ?? null),
    },
    refunds: {
      create: vi.fn(
        async (params: { payment_intent: string }, opts: { idempotencyKey?: string }) => {
          mockStripeState.refunds.push({
            payment_intent: params.payment_intent,
            key: opts.idempotencyKey,
          });
          return { id: `re_${mockStripeState.refunds.length}`, amount: 2500 };
        },
      ),
    },
  },
}));

const sentEmails: { to: string; subject: string }[] = [];
vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: { to: string; subject: string }) => {
        sentEmails.push({ to: args.to, subject: args.subject });
        return { id: `email_${sentEmails.length}` };
      }),
    },
  },
}));

type TokenCtx = { params: Promise<{ token: string }> };
type Route = { POST: (req: Request, ctx: TokenCtx) => Promise<Response> };
type GetRoute = { GET: (req: Request, ctx: TokenCtx) => Promise<Response> };

let db: PrismaClient;
let engine: GateEngine;
let publicRoute: Route & GetRoute;
let intentRoute: Route;
let world: AcceptanceWorld;

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
function get(token: string, ip: string): Request {
  return new Request(`http://localhost/api/gate/${token}`, {
    headers: { "x-forwarded-for": ip },
  });
}

async function makePayGate(eventId: string, config: Record<string, unknown>) {
  const created = await engine.createGate({
    workspaceId: world.workspace.id,
    resource: { type: "EVENT", id: eventId },
    spec: {
      kind: "GROUP",
      rule: "ALL",
      children: [{ kind: "CONDITION", conditionType: "PAY", config }],
    },
  });
  const node = await db.gateNode.findFirst({
    where: { gateId: created.gateId, conditionType: "PAY" },
    select: { id: true },
  });
  return { gateId: created.gateId, payNodeId: node!.id };
}

async function identify(
  gateId: string,
  email: string,
  ip: string,
  extra: Record<string, unknown> = {},
) {
  const session = await engine.createSession({ workspaceId: world.workspace.id, gateId });
  const res = await publicRoute.POST(
    post(session.token, "", { action: "identify", email, name: "Addendum guest", ...extra }, ip),
    tokenCtx(session.token),
  );
  expect(res.status).toBe(200);
  return session;
}

async function payThrough(
  session: { token: string },
  payNodeId: string,
  email: string,
  ip: string,
) {
  const mint = await intentRoute.POST(
    post(session.token, "/payment-intent", { nodeId: payNodeId }, ip),
    tokenCtx(session.token),
  );
  expect(mint.status).toBe(200);
  const intentId = `pi_addendum_${mockStripeState.seq}`;
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
  return { intentId, memberId: member!.id };
}

describeDb("Phase F addendum acceptance (10-13)", () => {
  beforeAll(async () => {
    process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_fixture";
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import("@/app/api/gate/[token]/route")) as unknown as Route & GetRoute;
    intentRoute = (await import(
      "@/app/api/gate/[token]/payment-intent/route"
    )) as unknown as Route;
    world = await seedAcceptanceWorld(db, "gate-addendum");
  }, 180_000);

  it(
    "acceptance 10: three separate consent signals; checking nothing still buys",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-addendum-consent");
      const { gateId, payNodeId } = await makePayGate(eventId, { priceCents: 2500 });

      // Full consent: phone + both boxes.
      const consented = await identify(gateId, "consent-yes@example.com", "10.5.0.1", {
        phone: "+15125551234",
        emailOptIn: true,
        smsOptIn: true,
      });
      expect(consented).toBeTruthy();
      const optedIn = await db.member.findFirst({
        where: { workspaceId: world.workspace.id, email: "consent-yes@example.com" },
        select: {
          phone: true,
          marketingEmailOptIn: true,
          marketingEmailOptInAt: true,
          marketingSmsOptIn: true,
          marketingSmsOptInAt: true,
        },
      });
      expect(optedIn).toMatchObject({
        phone: "+15125551234",
        marketingEmailOptIn: true,
        marketingSmsOptIn: true,
      });
      expect(optedIn?.marketingEmailOptInAt).not.toBeNull();
      expect(optedIn?.marketingSmsOptInAt).not.toBeNull();

      // Email only - signals are separate, never bundled.
      await identify(gateId, "consent-email@example.com", "10.5.0.2", { emailOptIn: true });
      const emailOnly = await db.member.findFirst({
        where: { workspaceId: world.workspace.id, email: "consent-email@example.com" },
        select: { marketingEmailOptIn: true, marketingSmsOptIn: true },
      });
      expect(emailOnly).toEqual({ marketingEmailOptIn: true, marketingSmsOptIn: false });

      // Nothing checked: still completes the whole purchase.
      const silent = await identify(gateId, "consent-none@example.com", "10.5.0.3", {
        emailOptIn: false,
        smsOptIn: false,
      });
      const bought = await payThrough(silent, payNodeId, "consent-none@example.com", "10.5.0.3");
      const silentMember = await db.member.findFirst({
        where: { id: bought.memberId },
        select: { marketingEmailOptIn: true, marketingSmsOptIn: true, phone: true },
      });
      expect(silentMember).toEqual({
        marketingEmailOptIn: false,
        marketingSmsOptIn: false,
        phone: null,
      });
      const order = await db.order.findFirst({
        where: { workspaceId: world.workspace.id, stripePaymentIntentId: bought.intentId },
      });
      expect(order?.paymentStatus).toBe("CAPTURED"); // consent never gates the ticket
    },
    T,
  );

  it(
    "acceptance 11: confirmation email sends once on paid and once on comp",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-addendum-email");
      const { gateId, payNodeId } = await makePayGate(eventId, { priceCents: 2500 });
      await db.promoCode.create({
        data: {
          workspaceId: world.workspace.id,
          eventId,
          code: "EMAILCOMP",
          discountType: "comp",
          discountValue: 100,
        },
      });

      sentEmails.length = 0;
      const buyer = await identify(gateId, "email-paid@example.com", "10.5.1.1");
      const paid = await payThrough(buyer, payNodeId, "email-paid@example.com", "10.5.1.1");
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe("email-paid@example.com");

      // Re-submit the same intent: recorded already, no second email.
      await publicRoute.POST(
        post(
          buyer.token,
          "",
          { action: "submit", nodeId: payNodeId, submission: { paymentIntentId: paid.intentId } },
          "10.5.1.1",
        ),
        tokenCtx(buyer.token),
      );
      expect(sentEmails).toHaveLength(1);

      // Comp order: no Stripe event exists, the direct send is the only one.
      const comped = await identify(gateId, "email-comp@example.com", "10.5.1.2");
      const res = await publicRoute.POST(
        post(comped.token, "", { action: "redeem_comp", nodeId: payNodeId, code: "EMAILCOMP" }, "10.5.1.2"),
        tokenCtx(comped.token),
      );
      expect(res.status).toBe(200);
      expect(sentEmails).toHaveLength(2);
      expect(sentEmails[1].to).toBe("email-comp@example.com");
    },
    T,
  );

  it(
    "acceptance 12: at cap the buyer sees sold out and no Order is written - even when the charge won the race",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-addendum-capacity");
      await db.event.update({ where: { id: eventId }, data: { capacity: 1 } });
      const { gateId, payNodeId } = await makePayGate(eventId, { priceCents: 2500 });

      // Both buyers mint while under cap - both charges will succeed.
      const alice = await identify(gateId, "cap-alice@example.com", "10.5.2.1");
      const bob = await identify(gateId, "cap-bob@example.com", "10.5.2.2");
      const aliceBuy = await payThrough(alice, payNodeId, "cap-alice@example.com", "10.5.2.1");
      expect(aliceBuy).toBeTruthy();

      // Bob mints BEFORE Alice's seat existed... he already identified; his
      // mint now happens at cap - the mint route refuses with sold-out copy.
      const bobMint = await intentRoute.POST(
        post(bob.token, "/payment-intent", { nodeId: payNodeId }, "10.5.2.2"),
        tokenCtx(bob.token),
      );
      expect(bobMint.status).toBe(409);
      expect(((await bobMint.json()) as { error: string }).error).toBe(
        "Every seat for this evening is spoken for.",
      );

      // The race: Carol minted + charged before the cap filled, submits after.
      // Her transaction rolls back (no Order), her money comes back, her
      // proof expires so the gate cannot open on a refunded charge.
      const carolEventId = await makeEvent(db, world.workspace.id, "gate-addendum-race");
      await db.event.update({ where: { id: carolEventId }, data: { capacity: 1 } });
      const raceGate = await makePayGate(carolEventId, { priceCents: 2500 });
      const dave = await identify(raceGate.gateId, "race-dave@example.com", "10.5.2.3");
      const carol = await identify(raceGate.gateId, "race-carol@example.com", "10.5.2.4");
      // Carol mints first (cap open at mint time)...
      const carolMint = await intentRoute.POST(
        post(carol.token, "/payment-intent", { nodeId: raceGate.payNodeId }, "10.5.2.4"),
        tokenCtx(carol.token),
      );
      expect(carolMint.status).toBe(200);
      const carolIntent = `pi_addendum_${mockStripeState.seq}`;
      // ...then Dave takes the last seat...
      await payThrough(dave, raceGate.payNodeId, "race-dave@example.com", "10.5.2.3");
      // ...and Carol's already-charged intent arrives late.
      const carolMember = await db.member.findFirst({
        where: { workspaceId: world.workspace.id, email: "race-carol@example.com" },
        select: { id: true },
      });
      mockStripeState.snapshots.set(carolIntent, {
        id: carolIntent,
        status: "succeeded",
        amount_received: 2500,
        currency: "usd",
        metadata: { memberId: carolMember!.id },
      });
      const refundsBefore = mockStripeState.refunds.length;
      const late = await publicRoute.POST(
        post(
          carol.token,
          "",
          { action: "submit", nodeId: raceGate.payNodeId, submission: { paymentIntentId: carolIntent } },
          "10.5.2.4",
        ),
        tokenCtx(carol.token),
      );
      expect(late.status).toBe(200);

      // No Order for Carol; her money went back; her proof no longer lives.
      expect(
        await db.order.count({
          where: { workspaceId: world.workspace.id, stripePaymentIntentId: carolIntent },
        }),
      ).toBe(0);
      expect(mockStripeState.refunds.length).toBe(refundsBefore + 1);
      expect(mockStripeState.refunds.at(-1)).toEqual({
        payment_intent: carolIntent,
        key: `capfull-${carolIntent}`,
      });
      const { isProofLive } = await import("@/lib/gate-engine/proofs");
      const carolProof = await db.gateProof.findFirst({
        where: { nodeId: raceGate.payNodeId, memberId: carolMember!.id },
        select: { status: true, expiresAt: true },
      });
      expect(isProofLive(carolProof!, new Date())).toBe(false);
      expect(
        await db.rSVP.count({
          where: {
            workspaceId: world.workspace.id,
            eventId: carolEventId,
            memberId: carolMember!.id,
            ticketStatus: { in: ["confirmed", "held"] },
          },
        }),
      ).toBe(0);
    },
    T,
  );

  it(
    "acceptance 13: windows + caps are enforced server-side and shape the offer",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-addendum-windows");
      const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      // Early Bird (closed), Door (not yet) - composed as real PAY nodes.
      const closed = await makePayGate(eventId, {
        priceCents: 2000,
        label: "Early Bird",
        availableUntil: past,
      });
      const closedSession = await identify(closed.gateId, "win-a@example.com", "10.5.3.1");
      const closedMint = await intentRoute.POST(
        post(closedSession.token, "/payment-intent", { nodeId: closed.payNodeId }, "10.5.3.1"),
        tokenCtx(closedSession.token),
      );
      expect(closedMint.status).toBe(409);
      expect(((await closedMint.json()) as { error: string }).error).toBe(
        "Sales for this ticket have closed.",
      );
      // The walkthrough does not offer it: designed copy, no action.
      const view = (await (
        await publicRoute.GET(get(closedSession.token, "10.5.3.1"), tokenCtx(closedSession.token))
      ).json()) as {
        sections: { steps: { offered: boolean; unofferedCopy?: string; action: string | null }[] }[];
      };
      const step = view.sections[0].steps[0];
      expect(step.offered).toBe(false);
      expect(step.action).toBeNull();
      expect(step.unofferedCopy).toBe("Sales closed");

      const notYetEventId = await makeEvent(db, world.workspace.id, "gate-addendum-notyet");
      const notYet = await makePayGate(notYetEventId, {
        priceCents: 3000,
        label: "Door",
        availableFrom: future,
      });
      const notYetSession = await identify(notYet.gateId, "win-b@example.com", "10.5.3.2");
      const notYetMint = await intentRoute.POST(
        post(notYetSession.token, "/payment-intent", { nodeId: notYet.payNodeId }, "10.5.3.2"),
        tokenCtx(notYetSession.token),
      );
      expect(notYetMint.status).toBe(409);
      expect(((await notYetMint.json()) as { error: string }).error).toBe(
        "This ticket is not on sale yet.",
      );

      // Quantity cap: one sold - the node stops being offered and minting.
      const capEventId = await makeEvent(db, world.workspace.id, "gate-addendum-nodecap");
      const capped = await makePayGate(capEventId, { priceCents: 2500, maxQuantity: 1 });
      const first = await identify(capped.gateId, "cap-first@example.com", "10.5.3.3");
      await payThrough(first, capped.payNodeId, "cap-first@example.com", "10.5.3.3");
      const second = await identify(capped.gateId, "cap-second@example.com", "10.5.3.4");
      const cappedMint = await intentRoute.POST(
        post(second.token, "/payment-intent", { nodeId: capped.payNodeId }, "10.5.3.4"),
        tokenCtx(second.token),
      );
      expect(cappedMint.status).toBe(409);
      expect(((await cappedMint.json()) as { error: string }).error).toBe(
        "Sales for this ticket have closed.",
      );
      const cappedView = (await (
        await publicRoute.GET(get(second.token, "10.5.3.4"), tokenCtx(second.token))
      ).json()) as { sections: { steps: { offered: boolean }[] }[] };
      expect(cappedView.sections[0].steps[0].offered).toBe(false);
    },
    T,
  );
});
