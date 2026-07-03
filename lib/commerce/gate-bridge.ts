/** Gate -> commerce bridge (Event Builder Rebuild, Phase A).
 *
 *  The engine's job ends at proofs; this bridge makes the money + attendance
 *  records real. Called by the public token route after every evaluation:
 *
 *  - A satisfied PAY proof (mechanism STRIPE_PAYMENT) gets its Order +
 *    Ticket + confirmed RSVP, keyed idempotently on the payment intent id.
 *    Runs both for the just-submitted node and, on any OPEN evaluation, as a
 *    sweep across every PAY node - so a crash between charge and record
 *    self-heals the next time the guest loads the page.
 *  - An OPEN gate always ends with a confirmed RSVP (ensureOpenAdmission) -
 *    the door list reads RSVP.ticketStatus, so opening without one would
 *    admit nobody.
 *
 *  Never throws at the caller: a bridge failure after a real charge is loud
 *  (console + alert) but must not turn a succeeded payment into a guest-
 *  facing error.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { alert } from "@/lib/alerting";
import type { GuestGateContext } from "@/lib/gate-engine/guest-session";
import { isProofLive } from "@/lib/gate-engine/proofs";
import { CONDITION_COLLECT_INFO, CONDITION_PAY } from "@/lib/gate-engine/types";
import { sendTicketConfirmation } from "./confirmation";
import {
  CapacityFullError,
  PromoExhaustedError,
  ensureOpenAdmission,
  recordPaidAdmission,
  type AdmissionMember,
} from "./orders";

const payPayloadShape = z.object({
  paymentIntentId: z.string().min(1),
  amountReceived: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  // D6: present only when the verifier honored a node-bound discount stamp.
  promoCodeId: z.string().min(1).optional(),
  baseCents: z.number().int().min(1).optional(),
  discountCents: z.number().int().min(1).optional(),
});

const priceShape = z.object({ priceCents: z.number().int().min(0) });

async function recordForPayNode(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    member: AdmissionMember;
    gateSessionId: string;
    node: { id: string; config: unknown };
  },
): Promise<"recorded" | "skipped" | "refunded"> {
  const proof = await db.gateProof.findFirst({
    where: { nodeId: args.node.id, memberId: args.member.id },
    select: { status: true, expiresAt: true, mechanism: true, payload: true },
  });
  if (
    !proof ||
    proof.mechanism !== "STRIPE_PAYMENT" ||
    !isProofLive(proof, new Date())
  ) {
    return "skipped";
  }
  const payload = payPayloadShape.safeParse(proof.payload);
  if (!payload.success) return "skipped";
  const price = priceShape.safeParse(args.node.config ?? {});

  // D6: a discounted charge keeps the honest split - subtotal is the base
  // price from the verifier's stamp, the discount rides its own column.
  const promo =
    payload.data.promoCodeId &&
    payload.data.baseCents &&
    payload.data.discountCents &&
    payload.data.discountCents < payload.data.baseCents
      ? {
          promoCodeId: payload.data.promoCodeId,
          baseCents: payload.data.baseCents,
          discountCents: payload.data.discountCents,
        }
      : null;

  try {
    const admission = await recordPaidAdmission(db, {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      member: args.member,
      paymentIntentId: payload.data.paymentIntentId,
      subtotalCents: promo
        ? promo.baseCents
        : price.success
          ? Math.min(price.data.priceCents, payload.data.amountReceived)
          : payload.data.amountReceived,
      amountReceivedCents: payload.data.amountReceived,
      currency: payload.data.currency,
      gateSessionId: args.gateSessionId,
      promo: promo
        ? { promoCodeId: promo.promoCodeId, discountCents: promo.discountCents }
        : null,
    });
    // Phase F (ADD 2): confirmation on the FIRST record only - the webhook
    // provably never emails gate purchases (row absent or already CAPTURED
    // when it fires), so this direct send cannot double.
    if (!admission.alreadyRecorded && admission.rsvpId) {
      await sendTicketConfirmation(db, {
        workspaceId: args.workspaceId,
        eventId: args.eventId,
        memberId: args.member.id,
        rsvpId: admission.rsvpId,
      });
    }
    return "recorded";
  } catch (err) {
    if (err instanceof CapacityFullError) {
      // Phase F (ADD 3): the last seat went to a racing buyer AFTER this
      // charge succeeded. No Order was written (the transaction rolled
      // back); return the money immediately and expire the proof so the
      // gate cannot open on a refunded charge.
      await refundChargeAndExpireProof(db, {
        nodeId: args.node.id,
        memberId: args.member.id,
        paymentIntentId: payload.data.paymentIntentId,
        idempotencyPrefix: "capfull",
        logLabel: "capacity-race",
      });
      void alert({
        severity: "warn",
        event: "gate.capacity_race_refunded",
        workspaceId: args.workspaceId,
        context: {
          eventId: args.eventId,
          paymentIntentId: payload.data.paymentIntentId,
        },
      });
      return "refunded";
    }
    if (err instanceof PromoExhaustedError) {
      // D6: the code's last use went to a racing redeemer AFTER this charge
      // succeeded. Same treatment as the capacity race - nothing landed,
      // return the money, expire the proof.
      await refundChargeAndExpireProof(db, {
        nodeId: args.node.id,
        memberId: args.member.id,
        paymentIntentId: payload.data.paymentIntentId,
        idempotencyPrefix: "promoexh",
        logLabel: "promo-race",
      });
      void alert({
        severity: "warn",
        event: "gate.promo_race_refunded",
        workspaceId: args.workspaceId,
        context: {
          eventId: args.eventId,
          paymentIntentId: payload.data.paymentIntentId,
          promoCodeId: promo?.promoCodeId ?? null,
        },
      });
      return "refunded";
    }
    throw err;
  }
}

/** Shared race-loser treatment: the charge succeeded but the admission
 *  transaction rolled back - refund the intent and expire the proof so the
 *  gate cannot open on money we returned. Refund failures are loud but do
 *  not throw: the proof expiry below must still run. */
async function refundChargeAndExpireProof(
  db: PrismaClient,
  args: {
    nodeId: string;
    memberId: string;
    paymentIntentId: string;
    idempotencyPrefix: string;
    logLabel: string;
  },
): Promise<void> {
  const { stripe } = await import("@/lib/stripe");
  await stripe.refunds
    .create(
      { payment_intent: args.paymentIntentId },
      { idempotencyKey: `${args.idempotencyPrefix}-${args.paymentIntentId}` },
    )
    .catch((refundErr) => {
      console.error(`[gate-bridge] ${args.logLabel} auto-refund failed`, {
        paymentIntentId: args.paymentIntentId,
        error:
          refundErr instanceof Error ? refundErr.message : String(refundErr),
      });
    });
  await db.gateProof.updateMany({
    where: {
      nodeId: args.nodeId,
      memberId: args.memberId,
      status: "SATISFIED",
    },
    data: { expiresAt: new Date() },
  });
}

const collectPayloadShape = z.object({
  answers: z.record(
    z.string(),
    z.union([z.string(), z.boolean(), z.number(), z.null()]),
  ),
  questions: z
    .array(z.object({ id: z.string(), label: z.string() }))
    .optional(),
});

/** Copy live COLLECT_INFO proof answers onto the member's RSVP row, keyed by
 *  question label so the operator attendee surfaces render them as-is. */
async function persistCollectedAnswers(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    gateId: string;
    memberId: string;
  },
): Promise<void> {
  const nodes = await db.gateNode.findMany({
    where: {
      gateId: args.gateId,
      workspaceId: args.workspaceId,
      kind: "CONDITION",
      conditionType: CONDITION_COLLECT_INFO,
    },
    select: { id: true },
  });
  if (nodes.length === 0) return;

  const merged: Record<string, string | boolean | number | null> = {};
  for (const node of nodes) {
    const proof = await db.gateProof.findFirst({
      where: { nodeId: node.id, memberId: args.memberId },
      select: { status: true, expiresAt: true, payload: true },
    });
    if (!proof || !isProofLive(proof, new Date())) continue;
    const payload = collectPayloadShape.safeParse(proof.payload);
    if (!payload.success) continue;
    const labelById = new Map(
      (payload.data.questions ?? []).map((q) => [q.id, q.label]),
    );
    for (const [id, value] of Object.entries(payload.data.answers)) {
      merged[labelById.get(id) ?? id] = value;
    }
  }
  if (Object.keys(merged).length === 0) return;

  const rsvp = await db.rSVP.findFirst({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      memberId: args.memberId,
    },
    select: { id: true, customAnswers: true },
  });
  if (!rsvp) return;
  const existing =
    rsvp.customAnswers && typeof rsvp.customAnswers === "object"
      ? (rsvp.customAnswers as Record<string, unknown>)
      : {};
  await db.rSVP.update({
    where: { id: rsvp.id },
    data: {
      customAnswers: { ...existing, ...merged } as Prisma.InputJsonValue,
    },
  });
}

export async function bridgeGateAdmission(
  db: PrismaClient,
  args: {
    context: GuestGateContext;
    open: boolean;
    submittedNodeId?: string;
  },
): Promise<void> {
  const { session, gate } = args.context;
  if (gate.resourceType !== "EVENT" || !session.memberId) return;
  const workspaceId = session.workspaceId;
  const eventId = gate.resourceId;

  try {
    const member = await db.member.findFirst({
      where: { id: session.memberId, workspaceId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!member) return;

    const payNodes = await db.gateNode.findMany({
      where: {
        gateId: gate.id,
        workspaceId,
        kind: "CONDITION",
        conditionType: CONDITION_PAY,
      },
      select: { id: true, config: true },
    });

    const targets = args.open
      ? payNodes // open sweep: self-heal any recorded-charge gap
      : payNodes.filter((n) => n.id === args.submittedNodeId);
    let raceRefunded = false;
    for (const node of targets) {
      const result = await recordForPayNode(db, {
        workspaceId,
        eventId,
        member,
        gateSessionId: session.id,
        node,
      });
      if (result === "refunded") raceRefunded = true;
    }

    // A race-lose refund just expired the proof that justified this pass's
    // `open` - the stale decision must not hand out a free confirmed seat.
    if (args.open && !raceRefunded) {
      try {
        await ensureOpenAdmission(db, {
          workspaceId,
          eventId,
          memberId: member.id,
        });
      } catch (err) {
        if (err instanceof CapacityFullError) {
          // A free-path open at capacity: no seat to give. Expected at cap -
          // the page renders sold out; nothing to unwind.
          return;
        }
        throw err;
      }
      // Collected registration answers must land where the operator looks
      // (RSVP.customAnswers), never satisfy-and-vanish in a proof payload.
      await persistCollectedAnswers(db, {
        workspaceId,
        eventId,
        gateId: gate.id,
        memberId: member.id,
      });
    }
  } catch (err) {
    console.error("[gate-bridge] admission record failed after evaluation", {
      workspaceId,
      eventId,
      gateSessionId: session.id,
      submittedNodeId: args.submittedNodeId ?? null,
      open: args.open,
      error: err instanceof Error ? err.message : String(err),
    });
    void alert({
      severity: "error",
      event: "gate.admission_record_failed",
      workspaceId,
      context: {
        eventId,
        gateSessionId: session.id,
        open: args.open,
      },
    });
  }
}
