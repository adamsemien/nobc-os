/** REFERRED_BY_MEMBER condition (Tier 1 / INTERNAL_RECORD - first-party).
 *
 *  Internal lookup of a referring member: satisfied when the member's
 *  referredByMemberId points at a member of the SAME workspace (workspace is
 *  the security boundary - a cross-tenant referrer never counts). Passive:
 *  the fact is first-party and needs no member action. Feeds the growth
 *  graph: a satisfied proof writes a REFERRAL edge (referrer -> member).
 *
 *  Carry-forward: ALWAYS - the referral is a permanent internal record.
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_REFERRED_BY_MEMBER } from "../types";

const referredByMemberConfigSchema = z.object({}).strict();
export type ReferredByMemberConfig = z.infer<typeof referredByMemberConfigSchema>;

export type ReferrerExistsCheck = (args: {
  workspaceId: string;
  referrerMemberId: string;
}) => Promise<boolean>;

async function defaultReferrerExists(args: {
  workspaceId: string;
  referrerMemberId: string;
}): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const referrer = await db.member.findFirst({
    where: { id: args.referrerMemberId, workspaceId: args.workspaceId },
    select: { id: true },
  });
  return referrer !== null;
}

export function createReferredByMemberCondition(ports?: {
  referrerExists?: ReferrerExistsCheck;
}): ConditionTypeDef<ReferredByMemberConfig> {
  const referrerExists = ports?.referrerExists ?? defaultReferrerExists;

  return {
    type: CONDITION_REFERRED_BY_MEMBER,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "INTERNAL_RECORD",
    configSchema: referredByMemberConfigSchema,
    guestPrompt: () => "A member referral on record unlocks this step.",
    isPassive: true,
    carryForward: { kind: "ALWAYS" },
    async verify({ member, workspaceId }) {
      const referrerId = member.referredByMemberId;
      if (!referrerId) {
        return { outcome: "REJECTED", reason: "no_referrer_on_record" };
      }
      const exists = await referrerExists({ workspaceId, referrerMemberId: referrerId });
      if (!exists) {
        return { outcome: "REJECTED", reason: "referrer_not_in_workspace" };
      }
      return {
        outcome: "SATISFIED",
        payload: { referrerMemberId: referrerId },
      };
    },
    feedsGrowthGraph(proof, ctx) {
      const payload = proof.payload as { referrerMemberId?: string } | null;
      if (!payload?.referrerMemberId) return null;
      return {
        type: "REFERRAL",
        fromMemberId: payload.referrerMemberId,
        toMemberId: ctx.memberId,
      };
    },
  };
}
