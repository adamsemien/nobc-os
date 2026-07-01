/** HOLD_MEMBERSHIP condition (Tier 1 / INTERNAL_RECORD - first-party).
 *
 *  Internal lookup of approved-member status: satisfied when the member's
 *  CURRENT state is status APPROVED, approved = true, and NOT red-listed.
 *
 *  Carry-forward: LIVE - re-verified on every evaluation (Adam's 2026-07-01
 *  unlock of §16.4 "membership always"): a revoked or red-listed member must
 *  never pass on a stale proof. The orchestrator loads the member row fresh
 *  per evaluation and trusts only this run's outcome.
 *
 *  Note: the live schema has no member-to-MembershipTier linkage column, so a
 *  tier-list config is deliberately absent in M1 (additive later if the
 *  linkage lands).
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_HOLD_MEMBERSHIP } from "../types";

const holdMembershipConfigSchema = z.object({}).strict();
export type HoldMembershipConfig = z.infer<typeof holdMembershipConfigSchema>;

export function createHoldMembershipCondition(): ConditionTypeDef<HoldMembershipConfig> {
  return {
    type: CONDITION_HOLD_MEMBERSHIP,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "INTERNAL_RECORD",
    configSchema: holdMembershipConfigSchema,
    guestPrompt: () => "Membership with No Bad Company unlocks this step.",
    isPassive: true,
    carryForward: { kind: "LIVE" },
    async verify({ member }) {
      const isApprovedMember =
        member.status === "APPROVED" && member.approved && !member.redListed;
      if (isApprovedMember) {
        return { outcome: "SATISFIED", payload: { membershipStatus: "approved" } };
      }
      return {
        outcome: "REJECTED",
        reason: member.redListed ? "member_red_listed" : "not_an_approved_member",
      };
    },
  };
}
