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
  ensureOpenAdmission,
  recordPaidAdmission,
  type AdmissionMember,
} from "./orders";

const payPayloadShape = z.object({
  paymentIntentId: z.string().min(1),
  amountReceived: z.number().int().min(0),
  currency: z.string().min(3).max(3),
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
): Promise<void> {
  const proof = await db.gateProof.findFirst({
    where: { nodeId: args.node.id, memberId: args.member.id },
    select: { status: true, expiresAt: true, mechanism: true, payload: true },
  });
  if (
    !proof ||
    proof.mechanism !== "STRIPE_PAYMENT" ||
    !isProofLive(proof, new Date())
  ) {
    return;
  }
  const payload = payPayloadShape.safeParse(proof.payload);
  if (!payload.success) return;
  const price = priceShape.safeParse(args.node.config ?? {});

  try {
    const admission = await recordPaidAdmission(db, {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      member: args.member,
      paymentIntentId: payload.data.paymentIntentId,
      subtotalCents: price.success
        ? Math.min(price.data.priceCents, payload.data.amountReceived)
        : payload.data.amountReceived,
      amountReceivedCents: payload.data.amountReceived,
      currency: payload.data.currency,
      gateSessionId: args.gateSessionId,
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
  } catch (err) {
    if (err instanceof CapacityFullError) {
      // Phase F (ADD 3): the last seat went to a racing buyer AFTER this
      // charge succeeded. No Order was written (the transaction rolled
      // back); return the money immediately and expire the proof so the
      // gate cannot open on a refunded charge.
      const { stripe } = await import("@/lib/stripe");
      await stripe.refunds
        .create(
          { payment_intent: payload.data.paymentIntentId },
          { idempotencyKey: `capfull-${payload.data.paymentIntentId}` },
        )
        .catch((refundErr) => {
          console.error("[gate-bridge] capacity-race auto-refund failed", {
            paymentIntentId: payload.data.paymentIntentId,
            error:
              refundErr instanceof Error ? refundErr.message : String(refundErr),
          });
        });
      await db.gateProof.updateMany({
        where: {
          nodeId: args.node.id,
          memberId: args.member.id,
          status: "SATISFIED",
        },
        data: { expiresAt: new Date() },
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
      return;
    }
    throw err;
  }
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
    for (const node of targets) {
      await recordForPayNode(db, {
        workspaceId,
        eventId,
        member,
        gateSessionId: session.id,
        node,
      });
    }

    if (args.open) {
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
