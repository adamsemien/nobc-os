/** OPEN condition (Tier 1 / INTERNAL_RECORD - first-party).
 *
 *  The open door: verification always satisfies. This is the honest shape of
 *  "anyone can get in" - the evaluator fail-closes empty groups by locked M1
 *  decision, so an open gate carries this one passive condition instead of
 *  zero conditions. Minted as the default gate on every fresh builder draft
 *  (Loose Ends L1) so the rail sentence and the anon render agree from the
 *  first second.
 *
 *  Passive + LIVE like HOLD_MEMBERSHIP: no guest submission, re-verified on
 *  every evaluation, nothing carried. There is deliberately no config - an
 *  OPEN condition with knobs would be a different condition.
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_OPEN } from "../types";

const openConfigSchema = z.object({}).strict();
export type OpenConfig = z.infer<typeof openConfigSchema>;

export function createOpenCondition(): ConditionTypeDef<OpenConfig> {
  return {
    type: CONDITION_OPEN,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "INTERNAL_RECORD",
    configSchema: openConfigSchema,
    guestPrompt: () => "This evening is open - everyone is welcome.",
    isPassive: true,
    carryForward: { kind: "LIVE" },
    async verify() {
      return { outcome: "SATISFIED", payload: { openDoor: true } };
    },
  };
}
