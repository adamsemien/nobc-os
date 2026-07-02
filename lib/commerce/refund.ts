/** The per-refund state machine (Event Builder Rebuild, Phase C - Decision 4).
 *
 *  Extracted verbatim-in-behavior from app/api/stripe/refund/route.ts so the
 *  single-refund route and the mass-refund route run ONE machine:
 *
 *  - succeeded intent -> stripe.refunds.create (partial or remaining balance);
 *    requires_capture hold -> cancel (full only; $0 actually moved).
 *  - Cumulative idempotency: `refund-{rsvpId}-{cumulativeTarget}` dedupes a
 *    retry of the same refund at Stripe while a genuinely new partial gets a
 *    fresh key; `cancel-{rsvpId}` guards the hold release.
 *  - Full resolution writes REFUNDED + ticketStatus 'refunded' (off the door
 *    list) + refundedAt; partial keeps the seat, tracks the running total.
 *  - The charge.refunded webhook stays the reconciliation authority if the
 *    fast-path DB write fails.
 *
 *  Phase C addition - refund revokes proof: a FULL refund expires the PAY
 *  GateProof tied to the intent (honest revocation: the payment happened,
 *  it is simply no longer live), and moves the gate Order + Ticket to
 *  REFUNDED/CANCELLED. Partial refunds keep the seat and the proof.
 */
import type { PrismaClient } from "@prisma/client";
import { alert } from "@/lib/alerting";
import { db as defaultDb } from "@/lib/db";
import { emitEvent } from "@/lib/emit-event";
import { stripe } from "@/lib/stripe";
import { refundActionForStatus } from "@/lib/ticketing/pricing";

export type RefundOutcome =
  | {
      ok: true;
      rsvpId: string;
      thisRefundCents: number;
      cumulativeRefundCents: number;
      fully: boolean;
    }
  | { ok: false; rsvpId: string; status: number; error: string };

export type RefundableRsvp = {
  id: string;
  eventId: string;
  memberId: string;
  stripePaymentIntentId: string | null;
  paymentStatus: string | null;
  refundedAt: Date | null;
  amountCents: number | null;
  refundAmountCents: number | null;
};

const REFUNDABLE_SELECT = {
  id: true,
  eventId: true,
  memberId: true,
  stripePaymentIntentId: true,
  paymentStatus: true,
  refundedAt: true,
  amountCents: true,
  refundAmountCents: true,
} as const;

/** The event's refundable money rows: a real intent, not already fully
 *  refunded, not disputed. One place defines "refundable" for dry-run and
 *  execute alike. */
export async function listRefundableRsvps(
  db: PrismaClient,
  args: { workspaceId: string; eventId: string },
): Promise<RefundableRsvp[]> {
  return db.rSVP.findMany({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      stripePaymentIntentId: { not: null },
      refundedAt: null,
      OR: [
        { paymentStatus: null },
        { paymentStatus: { notIn: ["REFUNDED", "DISPUTED"] } },
      ],
    },
    select: REFUNDABLE_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

export function remainingRefundableCents(rsvp: RefundableRsvp): number {
  const charged = rsvp.amountCents ?? 0;
  return Math.max(0, charged - (rsvp.refundAmountCents ?? 0));
}

/** Full-refund follow-through on the v3 commerce records: expire the PAY
 *  proof bound to this intent, close the Order and Ticket. Safe on v1 rows
 *  (no matching records - every update is a no-op). Never throws. */
export async function revokeGateRecordsForIntent(
  db: PrismaClient,
  args: { workspaceId: string; paymentIntentId: string },
): Promise<void> {
  const now = new Date();
  try {
    await db.order.updateMany({
      where: {
        workspaceId: args.workspaceId,
        stripePaymentIntentId: args.paymentIntentId,
        paymentStatus: { not: "REFUNDED" },
      },
      data: { paymentStatus: "REFUNDED" },
    });
    await db.ticket.updateMany({
      where: {
        workspaceId: args.workspaceId,
        stripePaymentIntentId: args.paymentIntentId,
        status: { not: "REFUNDED" },
      },
      data: { status: "REFUNDED" },
    });
    // Honest revocation: the proof happened; it is no longer live. Matching
    // is precise - the proof payload carries the intent id the verifier saw.
    await db.gateProof.updateMany({
      where: {
        workspaceId: args.workspaceId,
        mechanism: "STRIPE_PAYMENT",
        status: "SATISFIED",
        payload: { path: ["paymentIntentId"], equals: args.paymentIntentId },
      },
      data: { expiresAt: now },
    });
  } catch (err) {
    console.error("[refund] gate-record revocation failed", {
      workspaceId: args.workspaceId,
      paymentIntentId: args.paymentIntentId,
      error: err instanceof Error ? err.message : String(err),
    });
    void alert({
      severity: "error",
      event: "refund.proof_revocation_failed",
      workspaceId: args.workspaceId,
      context: { paymentIntentId: args.paymentIntentId },
    });
  }
}

/** Run one refund through the machine. `amountCents` omitted = the whole
 *  remaining balance. Mirrors the historical route behavior exactly; the
 *  HTTP layer maps `status`/`error` straight through. */
export async function refundRsvp(args: {
  workspaceId: string;
  actorId: string;
  rsvpId: string;
  amountCents?: number;
  db?: PrismaClient;
}): Promise<RefundOutcome> {
  const db = args.db ?? defaultDb;
  const { workspaceId, actorId, rsvpId } = args;
  const fail = (status: number, error: string): RefundOutcome => ({
    ok: false,
    rsvpId,
    status,
    error,
  });

  const rsvp = await db.rSVP.findFirst({
    where: { id: rsvpId, workspaceId },
    select: REFUNDABLE_SELECT,
  });
  if (!rsvp) return fail(404, "RSVP not found");
  // A *fully* refunded ticket is gated by paymentStatus, not just refundedAt.
  if (rsvp.paymentStatus === "REFUNDED" || rsvp.refundedAt) {
    return fail(409, "Already refunded");
  }
  if (!rsvp.stripePaymentIntentId) return fail(400, "No payment to refund");

  const pi = await stripe.paymentIntents.retrieve(rsvp.stripePaymentIntentId);
  const action = refundActionForStatus(pi.status);

  // An uncaptured authorization can only be released in full.
  if (action.kind === "cancel" && args.amountCents != null) {
    return fail(
      400,
      "Cannot partially cancel an uncaptured authorization. Capture first, then refund a partial amount.",
    );
  }

  const alreadyRefunded = rsvp.refundAmountCents ?? 0;
  const chargedCents = rsvp.amountCents ?? pi.amount;
  if (!chargedCents || chargedCents <= 0) {
    return fail(500, "Cannot determine the charge amount to refund");
  }
  const remainingRefundable = chargedCents - alreadyRefunded;
  if (
    action.kind === "refund" &&
    args.amountCents != null &&
    args.amountCents > remainingRefundable
  ) {
    return fail(
      400,
      `Refund exceeds remaining refundable balance (${remainingRefundable} cents).`,
    );
  }

  let thisRefundCents: number;
  try {
    if (action.kind === "cancel") {
      await stripe.paymentIntents.cancel(
        rsvp.stripePaymentIntentId,
        {},
        { idempotencyKey: `cancel-${rsvp.id}` },
      );
      // A released hold never captured money - $0 actually refunded.
      thisRefundCents = 0;
    } else if (action.kind === "refund") {
      const cumulativeTarget =
        alreadyRefunded + (args.amountCents ?? remainingRefundable);
      const refund = await stripe.refunds.create(
        {
          payment_intent: rsvp.stripePaymentIntentId,
          ...(args.amountCents != null ? { amount: args.amountCents } : {}),
        },
        { idempotencyKey: `refund-${rsvp.id}-${cumulativeTarget}` },
      );
      thisRefundCents = refund.amount;
    } else {
      return fail(400, action.reason);
    }
  } catch (err) {
    void alert({
      severity: "critical",
      event: "stripe.refund.failed",
      workspaceId,
      context: {
        rsvpId,
        stripePaymentIntentId: rsvp.stripePaymentIntentId,
        actionKind: action.kind,
        errorClass: err instanceof Error ? err.constructor.name : "unknown",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error("[refund] stripe refund/cancel failed", {
      workspaceId,
      rsvpId,
      err,
    });
    return fail(502, "Refund failed");
  }

  const cumulativeRefundCents = alreadyRefunded + thisRefundCents;
  const fully =
    action.kind === "cancel" || cumulativeRefundCents >= chargedCents;

  // Stripe and Postgres cannot be written atomically; the charge.refunded
  // webhook is the reconciliation authority if this fast path fails.
  await db.rSVP.updateMany({
    where: { id: rsvpId, workspaceId },
    data: fully
      ? {
          paymentStatus: "REFUNDED",
          ticketStatus: "refunded",
          refundedAt: new Date(),
          refundAmountCents: cumulativeRefundCents,
        }
      : {
          paymentStatus: "PARTIALLY_REFUNDED",
          refundAmountCents: cumulativeRefundCents,
        },
  });

  if (fully) {
    // Phase C: a full refund revokes the PAY proof + closes Order/Ticket.
    await revokeGateRecordsForIntent(db, {
      workspaceId,
      paymentIntentId: rsvp.stripePaymentIntentId,
    });
  }

  await emitEvent({
    workspaceId,
    actorId,
    action: "rsvp.refunded",
    entityType: "RSVP",
    entityId: rsvpId,
    metadata: { refundAmountCents: thisRefundCents, cumulativeRefundCents, fully },
  });
  if (fully) {
    emitEvent({
      workspaceId,
      actorId,
      action: "rsvp.cancelled",
      entityType: "RSVP",
      entityId: rsvpId,
      metadata: { refundAmountCents: cumulativeRefundCents, reason: "operator_refund" },
    }).catch((err) =>
      console.error("[refund] rsvp.cancelled emit failed:", err),
    );
  }

  return { ok: true, rsvpId, thisRefundCents, cumulativeRefundCents, fully };
}
