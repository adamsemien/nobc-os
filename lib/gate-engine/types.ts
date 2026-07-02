/** Access Gate Engine v3 - M1 core types (Stage 17).
 *
 *  A Gate is a boolean expression tree of tiered-verification conditions.
 *  Everything here is headless and fail-closed: any ambiguity, malformation,
 *  or verifier failure evaluates NOT Open. Reason codes below are internal /
 *  audit copy only - they are never rendered to a guest.
 */
import type {
  GateGroupRule,
  GateNodeKind,
  GateProof,
  GateProofStatus,
  GateResourceType,
  Member,
  ProofMechanism,
  VerificationTier,
} from "@prisma/client";
import type { z } from "zod";

// ─── Condition type ids (M1 registry keys) ──────────────────────────────────
// conditionType is a string in the database (open registry - new types must
// not require DDL). These constants are the five M1 keys.
export const CONDITION_PAY = "PAY";
export const CONDITION_ANSWER_QUESTIONS = "ANSWER_QUESTIONS";
export const CONDITION_REFERRED_BY_MEMBER = "REFERRED_BY_MEMBER";
export const CONDITION_ATTENDED_PRIOR = "ATTENDED_PRIOR";
export const CONDITION_HOLD_MEMBERSHIP = "HOLD_MEMBERSHIP";
// Phase B (Event Builder Rebuild): collect-only registration fields - the
// honest home for questions with no scoring (FIRST_PARTY / INTERNAL_RECORD).
export const CONDITION_COLLECT_INFO = "COLLECT_INFO";

// ─── Carry-forward policy (Adam's §16.4 defaults) ───────────────────────────
// NEVER  - proof never carries across gates (PAY: payment is per-event).
// ALWAYS - a prior satisfied proof carries indefinitely (ATTENDED_PRIOR,
//          REFERRED_BY_MEMBER: permanent first-party facts).
// MONTHS - carries for N months from ORIGINAL verification, then re-ask
//          (ANSWER_QUESTIONS: 12). The window never refreshes on carry.
// LIVE   - never carried AND re-verified on every evaluation
//          (HOLD_MEMBERSHIP, unlocked by Adam 2026-07-01: a revoked or
//          red-listed member must not pass on a stale proof).
export type CarryForwardPolicy =
  | { kind: "NEVER" }
  | { kind: "ALWAYS" }
  | { kind: "MONTHS"; months: number }
  | { kind: "LIVE" };

// ─── Verifier outcomes ───────────────────────────────────────────────────────
// `reason` is an internal audit code, never guest-facing copy.
export type VerifyOutcome =
  | { outcome: "SATISFIED"; payload?: Record<string, unknown> }
  | { outcome: "REJECTED"; reason: string; payload?: Record<string, unknown> }
  | { outcome: "PENDING_REVIEW"; reason: string; payload?: Record<string, unknown> };

export type VerifyArgs<C> = {
  config: C;
  /** Whatever the caller submitted for this node; verifiers parse with Zod. */
  submission: unknown;
  /** Freshly loaded, workspace-scoped member row. */
  member: Member;
  workspaceId: string;
  resource: { type: GateResourceType; id: string };
};

export type GrowthEdgeWrite = {
  type: "REFERRAL";
  fromMemberId: string;
  toMemberId: string;
};

/** The condition type contract. Every type is a plugin; NO type is usable
 *  until its verifier exists and is tested (registry invariant). Tier and
 *  mechanism are stamped onto proofs from these constants - a verifier can
 *  never upgrade its own tier. */
export interface ConditionTypeDef<C = unknown> {
  type: string;
  verificationTier: VerificationTier;
  proofMechanism: ProofMechanism;
  configSchema: z.ZodType<C>;
  /** Guest-facing prompt copy. Brand law applies: "Access" not "RSVP",
   *  "No Bad Company" never "NBC", spaced hyphens, no raw enum values. */
  guestPrompt: (config: C) => string;
  /** Passive conditions may be verified by the engine without member action. */
  isPassive: boolean;
  carryForward: CarryForwardPolicy;
  verify: (args: VerifyArgs<C>) => Promise<VerifyOutcome>;
  /** Optional: project profile facts from a satisfied proof (unconsumed in M1). */
  feedsProfile?: (proof: GateProof) => Record<string, unknown> | null;
  /** Optional: emit a growth-graph edge when a proof is satisfied. */
  feedsGrowthGraph?: (
    proof: GateProof,
    ctx: { workspaceId: string; memberId: string }
  ) => GrowthEdgeWrite | null;
}

// ─── Materialized tree (input to the pure evaluator) ────────────────────────
export type GateTreeNode = {
  id: string;
  kind: GateNodeKind;
  /** Child-within-parent: an unsatisfied required child blocks Open
   *  regardless of the parent's rule. */
  required: boolean;
  /** This node's weight within a WEIGHTED parent. */
  weight: number | null;
  // GROUP fields
  rule: GateGroupRule | null;
  requiredCount: number | null;
  weightThreshold: number | null;
  children: GateTreeNode[];
  // CONDITION fields
  conditionType: string | null;
  config: unknown;
};

export type ProofSnapshot = {
  status: GateProofStatus;
  expiresAt: Date | null;
};

/** nodeId -> the member's live proof snapshot for that node. */
export type ProofIndex = Map<string, ProofSnapshot>;

// ─── Evaluation results ──────────────────────────────────────────────────────
export type NodeReasonCode =
  // condition outcomes
  | "SATISFIED_BY_PROOF"
  | "NO_PROOF"
  | "PROOF_NOT_SATISFIED"
  | "PROOF_EXPIRED"
  // group outcomes
  | "GROUP_SATISFIED"
  | "REQUIRED_CHILD_UNSATISFIED"
  | "RULE_UNMET"
  // structural violations (any one closes the whole gate)
  | "MALFORMED_NODE"
  | "EMPTY_GROUP"
  | "DEPTH_EXCEEDED"
  | "ROOT_NOT_GROUP"
  | "UNREGISTERED_CONDITION";

export type NodeEvaluation = {
  nodeId: string;
  satisfied: boolean;
  reason: NodeReasonCode;
};

export type GateEvaluation = {
  /** True only when the root is satisfied AND the tree has no structural
   *  violation anywhere. Fail-closed. */
  open: boolean;
  structuralViolation: boolean;
  nodes: NodeEvaluation[];
};

/** Top-level decision from the effectful orchestrator. */
export type GateDecision = {
  open: boolean;
  reason:
    | "EVALUATED"
    | "GATE_NOT_FOUND"
    | "MEMBER_NOT_FOUND"
    | "NO_ROOT"
    | "MULTIPLE_ROOTS";
  evaluation: GateEvaluation | null;
  /** Nodes whose verifier errored this run (each evaluated NOT satisfied). */
  verifierErrors: { nodeId: string; code: "VERIFIER_ERROR" | "INVALID_CONFIG" | "UNREGISTERED_CONDITION" }[];
};

// ─── Authoring spec (input to validate + createGate / updateGate) ────────────
// `id` is the round-trip identity for updateGate's id-stable diff (M3): a spec
// node carrying the id of an existing node of the same kind (and, for
// conditions, the same conditionType) is updated in place so its proofs
// survive the edit. Validation ignores it; createGate ignores it.
export type GateConditionSpec = {
  kind: "CONDITION";
  id?: string;
  conditionType: string;
  config: unknown;
  required?: boolean;
  weight?: number;
};

export type GateGroupSpec = {
  kind: "GROUP";
  id?: string;
  rule: "ALL" | "ANY_N" | "WEIGHTED";
  requiredCount?: number;
  weightThreshold?: number;
  required?: boolean;
  weight?: number;
  children: GateNodeSpec[];
};

export type GateNodeSpec = GateConditionSpec | GateGroupSpec;
