/** Access Gate Engine v3 - M1 public API surface (Stage 17).
 *
 *  Headless engine core. Production callers use `getGateEngine()` (lazy
 *  singleton wired to lib/db + the five M1 condition types). Tests build
 *  their own engine via `createGateEngine` + `createConditionRegistry` with
 *  injected ports.
 */
import { db } from "@/lib/db";
import { createDefaultConditionDefs } from "./conditions/defaults";
import { createConditionRegistry } from "./registry";
import { createGateEngine, type GateEngine } from "./orchestrate";

export { createDefaultConditionDefs } from "./conditions/defaults";

let _registry: ReturnType<typeof createConditionRegistry> | null = null;
let _engine: GateEngine | null = null;

export function getDefaultRegistry() {
  if (!_registry) {
    _registry = createConditionRegistry(createDefaultConditionDefs());
  }
  return _registry;
}

export function getGateEngine(): GateEngine {
  if (!_engine) {
    _engine = createGateEngine({ db, registry: getDefaultRegistry() });
  }
  return _engine;
}

export { createConditionRegistry, ConditionRegistry } from "./registry";
export { createGateEngine, GateAuthoringError } from "./orchestrate";
export type { GateEngine, EvaluateGateArgs } from "./orchestrate";
export { buildTree, deleteGate, getGateForResource, specToPreviewTree, toTreeNode, updateGate } from "./authoring";
export type { LoadedGate } from "./authoring";
export { evaluateTree } from "./evaluate";
export type { EvaluateOptions } from "./evaluate";
export { validateGateSpec, MAX_CONDITION_DEPTH, MAX_GROUP_DEPTH } from "./validate";
export {
  addMonthsUtc,
  carryForwardForNodes,
  computeExpiry,
  isProofLive,
  loadProofIndex,
  policyCarries,
  writeNodeProof,
} from "./proofs";
export { recordGrowthEdge } from "./growth";
export { projectGuestView } from "./guest-view";
export type { GuestGateView, GuestSectionView, GuestStepState, GuestStepView } from "./guest-view";
export {
  guestViewForSession,
  identifyGuestSession,
  loadGuestGateContext,
} from "./guest-session";
export type { GuestGateContext } from "./guest-session";
export { createPayCondition } from "./conditions/pay";
export type { PayConfig, StripeIntentReader, StripeIntentSnapshot, IntentOwnershipCheck } from "./conditions/pay";
export { createAnswerQuestionsCondition } from "./conditions/answer-questions";
export type { AnswerQuestionsConfig, ApplicationLoader, ApplicationScorer, ApplicationSnapshot } from "./conditions/answer-questions";
export { createReferredByMemberCondition } from "./conditions/referred-by-member";
export type { ReferredByMemberConfig, ReferrerExistsCheck } from "./conditions/referred-by-member";
export { createAttendedPriorCondition } from "./conditions/attended-prior";
export type { AttendedPriorConfig, CheckInCounter } from "./conditions/attended-prior";
export { createHoldMembershipCondition } from "./conditions/hold-membership";
export { createOpenCondition } from "./conditions/open";
export type { HoldMembershipConfig } from "./conditions/hold-membership";
export * from "./types";
