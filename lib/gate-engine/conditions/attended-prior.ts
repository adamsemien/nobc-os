/** ATTENDED_PRIOR condition (Tier 1 / INTERNAL_RECORD - first-party, passive).
 *
 *  Internal lookup of prior check-ins: satisfied when the member has at least
 *  config.minCount checked-in Access records (RSVP rows with checkedIn =
 *  true) in this workspace. Reads the RSVP rows themselves, not the
 *  denormalized Member.totalEventsAttended counter - source of truth over a
 *  counter that can drift.
 *
 *  Carry-forward: ALWAYS - attendance never expires (§16.4 LOCKED).
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_ATTENDED_PRIOR } from "../types";

const attendedPriorConfigSchema = z.object({
  minCount: z.number().int().min(1).default(1),
});
export type AttendedPriorConfig = z.infer<typeof attendedPriorConfigSchema>;

export type CheckInCounter = (args: {
  workspaceId: string;
  memberId: string;
}) => Promise<number>;

async function defaultCountCheckIns(args: {
  workspaceId: string;
  memberId: string;
}): Promise<number> {
  const { db } = await import("@/lib/db");
  return db.rSVP.count({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      checkedIn: true,
    },
  });
}

export function createAttendedPriorCondition(ports?: {
  countCheckIns?: CheckInCounter;
}): ConditionTypeDef<AttendedPriorConfig> {
  const countCheckIns = ports?.countCheckIns ?? defaultCountCheckIns;

  return {
    type: CONDITION_ATTENDED_PRIOR,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "INTERNAL_RECORD",
    configSchema: attendedPriorConfigSchema,
    guestPrompt: () => "This step recognizes guests who have attended before.",
    isPassive: true,
    carryForward: { kind: "ALWAYS" },
    async verify({ config, member, workspaceId }) {
      const count = await countCheckIns({ workspaceId, memberId: member.id });
      if (count >= config.minCount) {
        return { outcome: "SATISFIED", payload: { attendedCount: count } };
      }
      return {
        outcome: "REJECTED",
        reason: "insufficient_prior_attendance",
        payload: { attendedCount: count, minCount: config.minCount },
      };
    },
  };
}
