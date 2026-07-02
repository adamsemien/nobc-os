/** The five M1 condition types with production ports (Stage 17).
 *
 *  Kept free of module-scope db/stripe imports - the factories lazy-import
 *  their production ports inside verify(), so this module is safe to load in
 *  unit tests with no environment. Every entry has a tested server-side
 *  verifier: the registry invariant.
 */
import type { ConditionTypeDef } from "../types";
import { createAnswerQuestionsCondition } from "./answer-questions";
import { createAttendedPriorCondition } from "./attended-prior";
import { createCollectInfoCondition } from "./collect-info";
import { createHoldMembershipCondition } from "./hold-membership";
import { createPayCondition } from "./pay";
import { createReferredByMemberCondition } from "./referred-by-member";

export function createDefaultConditionDefs(): ConditionTypeDef<unknown>[] {
  return [
    createPayCondition(),
    createAnswerQuestionsCondition(),
    createReferredByMemberCondition(),
    createAttendedPriorCondition(),
    createHoldMembershipCondition(),
    createCollectInfoCondition(),
  ] as unknown as ConditionTypeDef<unknown>[];
}
