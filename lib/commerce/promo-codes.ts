/** PromoCode validation + comp redemption (Event Builder Rebuild, Phase A).
 *
 *  Decision 5 scope: COMP CODES ONLY are redeemable at the gate PAY step in
 *  this build. A comp code (discountType 'comp', or 'percent' at 100) skips
 *  Stripe entirely and satisfies the PAY node with an HONEST proof - the
 *  ProofMechanism is COMP_CODE, never STRIPE_PAYMENT, and the payload names
 *  the promo code and order. Partial-discount codes exist in the schema and
 *  validate here, but redemption refuses them (the PAY verifier's
 *  amount >= price replay defense would reject a discounted charge; wiring
 *  partial discounts through the verifier is a flagged follow-up, not a
 *  silent behavior change).
 *
 *  Every read is workspace-scoped. Codes are matched case-insensitively on
 *  the guest side but stored as authored.
 */
import type { PrismaClient, PromoCode } from "@prisma/client";
import { writeNodeProof } from "@/lib/gate-engine/proofs";
import { CONDITION_PAY } from "@/lib/gate-engine/types";
import { recordCompAdmission, type AdmissionMember } from "./orders";

export type CompCodeCheck =
  | { ok: true; promo: PromoCode }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" | "not_comp" };

export function isCompCode(promo: Pick<PromoCode, "discountType" | "discountValue">): boolean {
  return (
    promo.discountType === "comp" ||
    (promo.discountType === "percent" && promo.discountValue >= 100)
  );
}

/** Validate a code for one event + member. Fail-closed; reasons are for the
 *  server - guests get one generic message regardless. */
export async function checkCompCode(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    memberId: string;
    code: string;
    now?: Date;
  },
): Promise<CompCodeCheck> {
  const now = args.now ?? new Date();
  const code = args.code.trim();
  if (!code) return { ok: false, reason: "not_found" };

  const promo = await db.promoCode.findFirst({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      code: { equals: code, mode: "insensitive" },
    },
  });
  if (!promo) return { ok: false, reason: "not_found" };

  if (promo.validFrom && promo.validFrom.getTime() > now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (promo.validUntil && promo.validUntil.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: "exhausted" };
  }
  if (promo.maxUsesPerCustomer !== null) {
    const mine = await db.promoRedemption.count({
      where: {
        workspaceId: args.workspaceId,
        promoCodeId: promo.id,
        order: { buyerMemberId: args.memberId },
      },
    });
    if (mine >= promo.maxUsesPerCustomer) {
      return { ok: false, reason: "exhausted" };
    }
  }
  if (!isCompCode(promo)) return { ok: false, reason: "not_comp" };

  return { ok: true, promo };
}

/** Redeem a validated comp code against one PAY node: money records via
 *  recordCompAdmission, then the honest COMP_CODE proof. The proof is
 *  stamped FIRST_PARTY / COMP_CODE from constants here - the proof-honesty
 *  rule (tier + mechanism never come from runtime values) holds. Expiry is
 *  null: PAY proofs are per-event and never carry (the NEVER policy), so the
 *  proof lives exactly as long as its node. */
export async function redeemCompCode(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    member: AdmissionMember;
    promo: PromoCode;
    payNodeId: string;
    subtotalCents: number;
    now?: Date;
  },
): Promise<{ orderId: string; rsvpId: string; alreadyRecorded: boolean }> {
  const now = args.now ?? new Date();
  const admission = await recordCompAdmission(db, {
    workspaceId: args.workspaceId,
    eventId: args.eventId,
    member: args.member,
    promoCodeId: args.promo.id,
    subtotalCents: args.subtotalCents,
  });

  await writeNodeProof(db, {
    workspaceId: args.workspaceId,
    nodeId: args.payNodeId,
    memberId: args.member.id,
    conditionType: CONDITION_PAY,
    status: "SATISFIED",
    tier: "FIRST_PARTY",
    mechanism: "COMP_CODE",
    payload: {
      promoCodeId: args.promo.id,
      promoCode: args.promo.code,
      orderId: admission.orderId,
      compedCents: args.subtotalCents,
    },
    sourceProofId: null,
    verifiedAt: now,
    expiresAt: null,
  });

  return {
    orderId: admission.orderId,
    rsvpId: admission.rsvpId,
    alreadyRecorded: admission.alreadyRecorded,
  };
}
