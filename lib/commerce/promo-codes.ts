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

/** Shared window + cap checks - the comp and discount paths must never
 *  drift on what "usable" means. Per-customer counting goes through
 *  PromoRedemption -> order.buyerMemberId (the only linkage that exists). */
async function promoUsable(
  db: PrismaClient,
  promo: PromoCode,
  args: { workspaceId: string; memberId: string; now: Date },
): Promise<"ok" | "expired" | "exhausted"> {
  if (promo.validFrom && promo.validFrom.getTime() > args.now.getTime()) {
    return "expired";
  }
  if (promo.validUntil && promo.validUntil.getTime() <= args.now.getTime()) {
    return "expired";
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return "exhausted";
  }
  if (promo.maxUsesPerCustomer !== null) {
    const mine = await db.promoRedemption.count({
      where: {
        workspaceId: args.workspaceId,
        promoCodeId: promo.id,
        order: { buyerMemberId: args.memberId },
      },
    });
    if (mine >= promo.maxUsesPerCustomer) return "exhausted";
  }
  return "ok";
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

  const usable = await promoUsable(db, promo, {
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    now,
  });
  if (usable !== "ok") return { ok: false, reason: usable };
  if (!isCompCode(promo)) return { ok: false, reason: "not_comp" };

  return { ok: true, promo };
}

// ── Partial-discount codes (D6) ─────────────────────────────────────────────

export type DiscountCodeCheck =
  | { ok: true; promo: PromoCode; discountCents: number; discountedCents: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "expired"
        | "exhausted"
        | "comp_code"
        | "covers_full_ticket"
        | "out_of_scope";
    };

/** The discount a partial code takes off a base price (D6-2). Percent rounds
 *  on the cent; flat is the authored cents. Null = not a partial type. */
export function discountForPromo(
  promo: Pick<PromoCode, "discountType" | "discountValue">,
  baseCents: number,
): number | null {
  if (promo.discountType === "percent") {
    return Math.round((baseCents * promo.discountValue) / 100);
  }
  if (promo.discountType === "flat") return promo.discountValue;
  return null;
}

/** Validate a partial-discount code against one PAY price (D6). Comp-class
 *  codes report "comp_code" so the caller routes them through the existing
 *  zero-Stripe machinery - never a second zero-charge path. A discount that
 *  zeroes or inverts the price is refused, not clamped (D6-2). Fail-closed.
 *
 *  Scope (Loose Ends L7): a code redeems here when it is scoped to THIS
 *  event, or to the series this event belongs to. `seriesId` is the event's
 *  own series, read server-side by the caller - never client input. On a
 *  code-string collision the event-scoped code wins. */
export async function checkDiscountCode(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    seriesId: string | null;
    memberId: string;
    code: string;
    baseCents: number;
    now?: Date;
  },
): Promise<DiscountCodeCheck> {
  const now = args.now ?? new Date();
  const code = args.code.trim();
  if (!code || !Number.isInteger(args.baseCents) || args.baseCents <= 0) {
    return { ok: false, reason: "not_found" };
  }

  const candidates = await db.promoCode.findMany({
    where: {
      workspaceId: args.workspaceId,
      code: { equals: code, mode: "insensitive" },
      OR: [
        { eventId: args.eventId },
        ...(args.seriesId ? [{ seriesId: args.seriesId }] : []),
      ],
    },
  });
  const promo =
    candidates.find((p) => p.eventId === args.eventId) ?? candidates[0] ?? null;
  if (!promo) return { ok: false, reason: "not_found" };
  // A PAY node has no tier - tier-scoped codes do not redeem at a gate
  // (D6-7), whether event- or series-scoped.
  if (promo.tierId !== null) return { ok: false, reason: "out_of_scope" };
  if (isCompCode(promo)) return { ok: false, reason: "comp_code" };

  const usable = await promoUsable(db, promo, {
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    now,
  });
  if (usable !== "ok") return { ok: false, reason: usable };

  const discountCents = discountForPromo(promo, args.baseCents);
  if (
    discountCents === null ||
    !Number.isInteger(discountCents) ||
    discountCents <= 0
  ) {
    return { ok: false, reason: "not_found" };
  }
  if (discountCents >= args.baseCents) {
    return { ok: false, reason: "covers_full_ticket" };
  }
  return {
    ok: true,
    promo,
    discountCents,
    discountedCents: args.baseCents - discountCents,
  };
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
    promoMaxUses: args.promo.maxUses,
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
