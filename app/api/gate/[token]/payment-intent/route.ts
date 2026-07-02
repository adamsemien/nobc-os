/** Gate PAY step: payment-intent mint (Stage 17, M4-PAY - greenlit 2026-07-02).
 *
 *  POST { nodeId } on an identified session whose gate carries that PAY node
 *  -> { clientSecret } for the in-page Payment Element, or
 *  -> { alreadyPaid: true } when the member already holds a live SATISFIED
 *     proof (established truth - a paid step never mints a second intent).
 *
 *  Money semantics (Adam's Decision 1): AUTO-CAPTURE. No capture_method is
 *  set, so Stripe captures on confirmation - no authorization hold that can
 *  lapse unclaimed. The intent is bound to the member server-side via
 *  metadata.memberId (what the M1 verifier's ownership check reads), and the
 *  Stripe idempotency key makes double-clicks reuse one intent while a price
 *  change mints a fresh one.
 *
 *  SAFETY RAIL: live-mode charges are OFF by default. Unless the secret key
 *  is a test key, this route refuses to mint (503) until the explicit
 *  GATE_PAY_LIVE_CHARGES=1 opt-in is set - enabling live money movement is a
 *  deliberate step Adam takes, never a side effect of merging this branch.
 *
 *  This route is NEW and parallel: the frozen v1 payment routes are untouched.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { applyServiceFee, feePolicyFromEvent } from "@/lib/commerce/service-fee";
import { db } from "@/lib/db";
import { getDefaultRegistry } from "@/lib/gate-engine";
import { payNodeAvailability } from "@/lib/gate-engine/conditions/pay";
import { isProofLive } from "@/lib/gate-engine/proofs";
import { loadGuestGateContext } from "@/lib/gate-engine/guest-session";
import { CONDITION_PAY } from "@/lib/gate-engine/types";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";

const intentLimiter = createRateLimiter({ limit: 6, windowMs: 60_000 });

const bodySchema = z.object({ nodeId: z.string().min(1).max(64) });

// Narrow read of the ALREADY-validated config (the registry schema parsed it,
// including the currency default) - not a second validation layer.
const priceShape = z.object({
  priceCents: z.number().int(),
  currency: z.string(),
});

const UNREADABLE = NextResponse.json(
  { error: "That request could not be read." },
  { status: 400 }
);

function liveChargesBlocked(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const isTestKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  return !isTestKey && process.env.GATE_PAY_LIVE_CHARGES !== "1";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const rateKey = `${token}:${clientIpFrom(req)}`;
  if (!intentLimiter.allow(rateKey)) {
    return NextResponse.json(
      { error: "Too many requests. Give it a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(intentLimiter.retryAfterSeconds(rateKey)) },
      }
    );
  }

  let nodeId: string;
  try {
    nodeId = bodySchema.parse(await req.json()).nodeId;
  } catch {
    return UNREADABLE;
  }

  const context = await loadGuestGateContext(db, token);
  if (!context) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { session, gate } = context;
  if (!session.memberId) {
    return NextResponse.json(
      { error: "Tell us who you are first." },
      { status: 409 }
    );
  }

  const node = await db.gateNode.findFirst({
    where: {
      id: nodeId,
      gateId: session.gateId,
      workspaceId: session.workspaceId,
      conditionType: CONDITION_PAY,
    },
    select: { id: true, gateId: true, config: true },
  });
  if (!node) return UNREADABLE;

  const def = getDefaultRegistry().get(CONDITION_PAY);
  const parsedConfig = def?.configSchema.safeParse(node.config ?? {});
  const price = parsedConfig?.success ? priceShape.safeParse(parsedConfig.data) : null;
  if (!price?.success || price.data.priceCents <= 0) {
    console.error("[gate-pay] PAY node config unusable for intent mint", {
      nodeId: node.id,
      workspaceId: session.workspaceId,
    });
    return UNREADABLE;
  }

  // Established truth: a live SATISFIED proof means this step is paid - never
  // mint another intent for it.
  const existing = await db.gateProof.findFirst({
    where: { nodeId: node.id, memberId: session.memberId },
    select: { status: true, expiresAt: true },
  });
  if (existing && existing.status === "SATISFIED" && isProofLive(existing, new Date())) {
    return NextResponse.json({ alreadyPaid: true });
  }

  // Phase F (ADD 4): availability is enforced HERE, server-side, at the
  // offer layer - never inside the evaluator. Outside its window or at its
  // per-node cap, the node mints nothing.
  const now = new Date();
  const soldCount = await db.gateProof.count({
    where: {
      nodeId: node.id,
      status: "SATISFIED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  const availability = payNodeAvailability(
    parsedConfig!.success ? (parsedConfig!.data as Parameters<typeof payNodeAvailability>[0]) : {},
    { now, soldCount },
  );
  if (!availability.available) {
    return NextResponse.json(
      {
        error:
          availability.reason === "not_yet"
            ? "This ticket is not on sale yet."
            : "Sales for this ticket have closed.",
      },
      { status: 409 }
    );
  }

  // Service fee (Decision 3): the event's fee policy shapes what the buyer is
  // charged. Default absorb = the flat ticket price. The line items go back to
  // the client so the pay step never shows a silently inflated single price.
  let lineItems = applyServiceFee(price.data.priceCents, {
    mode: "absorb",
    percentBps: null,
    flatCents: null,
  });
  if (gate.resourceType === "EVENT") {
    const event = await db.event.findFirst({
      where: { id: gate.resourceId, workspaceId: session.workspaceId },
      select: {
        serviceFeeMode: true,
        serviceFeePercentBps: true,
        serviceFeeFlatCents: true,
        capacity: true,
      },
    });
    if (event) {
      // Phase F (ADD 3): sold out is enforced before any intent exists -
      // the buyer at cap sees the sold-out state, never a charge.
      if (event.capacity !== null) {
        const taken = await db.rSVP.count({
          where: {
            workspaceId: session.workspaceId,
            eventId: gate.resourceId,
            ticketStatus: { in: ["confirmed", "held"] },
          },
        });
        if (taken >= event.capacity) {
          return NextResponse.json(
            { error: "Every seat for this evening is spoken for." },
            { status: 409 }
          );
        }
      }
      lineItems = applyServiceFee(price.data.priceCents, feePolicyFromEvent(event));
    }
  }

  if (liveChargesBlocked()) {
    console.error(
      "[gate-pay] refusing to mint: live Stripe key without GATE_PAY_LIVE_CHARGES=1",
      { workspaceId: session.workspaceId }
    );
    return NextResponse.json(
      { error: "Ticket payments are not available right now." },
      { status: 503 }
    );
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: lineItems.totalCents,
        currency: price.data.currency,
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: "gate-pay",
          workspaceId: session.workspaceId,
          gateId: session.gateId,
          nodeId: node.id,
          memberId: session.memberId,
          gateSessionId: session.id,
          // Ticket/fee split for the Stripe record (total - fee = ticket).
          subtotalCents: String(lineItems.subtotalCents),
          serviceFeeCents: String(lineItems.serviceFeeCents),
        },
      },
      // Total in the key: a price OR fee-policy change mints a fresh intent
      // instead of Stripe returning the stale-amount original.
      { idempotencyKey: `gate-pay:${session.id}:${node.id}:${lineItems.totalCents}` }
    );
    return NextResponse.json({ clientSecret: intent.client_secret, lineItems });
  } catch (err) {
    console.error("[gate-pay] intent mint failed", {
      nodeId: node.id,
      workspaceId: session.workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Ticket payments are not available right now." },
      { status: 503 }
    );
  }
}
