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
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { alert } from "@/lib/alerting";
import type { GuestGateContext } from "@/lib/gate-engine/guest-session";
import { isProofLive } from "@/lib/gate-engine/proofs";
import { CONDITION_PAY } from "@/lib/gate-engine/types";
import {
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

  await recordPaidAdmission(db, {
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
      await ensureOpenAdmission(db, {
        workspaceId,
        eventId,
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
