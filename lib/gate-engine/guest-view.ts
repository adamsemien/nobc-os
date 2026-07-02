/** Guest-safe view projection (Stage 17, M2 guest render).
 *
 *  The ONLY layer that turns engine state into guest-facing shape. Hard
 *  guarantees, enforced by tests/unit/gate-engine/guest-view.test.ts:
 *
 *  - No raw enum value, node reason code, or verifier rejection reason ever
 *    appears in the output. A guest never learns WHY something was declined
 *    (operator surfaces get that; guests get state only).
 *  - Every string is brand-law copy: "Access" not "RSVP", "No Bad Company"
 *    never "NBC", spaced hyphens, confirmation state "You're on the list".
 *  - Fail-closed: a structurally invalid or unprojectable gate renders as
 *    unavailable - never as open, never as a stack trace.
 */
import type { ConditionRegistry } from "./registry";
import { CONDITION_ANSWER_QUESTIONS } from "./types";
import type { GateEvaluation, GateTreeNode, ProofIndex } from "./types";

export type GuestStepState = "complete" | "needed" | "in_review";

/** Guest-actionable step kinds (M4). A designed union, never a registry key -
 *  the no-raw-enums guarantee holds. "apply" offers the application bridge. */
export type GuestStepAction = "apply" | null;

export type GuestStepView = {
  nodeId: string;
  prompt: string;
  state: GuestStepState;
  required: boolean;
  action: GuestStepAction;
};

export type GuestSectionView = {
  headline: string;
  satisfied: boolean;
  steps: GuestStepView[];
};

export type GuestGateView =
  | { available: false }
  | {
      available: true;
      open: boolean;
      headline: string;
      needsIdentity: boolean;
      sections: GuestSectionView[];
    };

const UNAVAILABLE: GuestGateView = { available: false };

const OPEN_HEADLINE = "You're on the list";
const STEPS_HEADLINE = "A few steps unlock your access";
const FALLBACK_PROMPT = "Complete this step.";

function groupHeadline(node: GateTreeNode): string {
  switch (node.rule) {
    case "ALL":
      return "Complete all of these";
    case "ANY_N":
      return node.requiredCount === 1
        ? "Complete any one of these"
        : `Complete any ${node.requiredCount ?? 1} of these`;
    case "WEIGHTED":
      // Weights are operator mechanics - guests get intuitive copy.
      return "Complete enough of these";
    default:
      return "Complete these";
  }
}

export function projectGuestView(args: {
  tree: GateTreeNode | null;
  /** Null before the guest has identified (no member, no proofs yet). */
  evaluation: GateEvaluation | null;
  proofs: ProofIndex;
  registry: ConditionRegistry;
  needsIdentity: boolean;
}): GuestGateView {
  const { tree, evaluation, proofs, registry, needsIdentity } = args;

  if (!tree || tree.kind !== "GROUP") return UNAVAILABLE;
  if (evaluation?.structuralViolation) return UNAVAILABLE;

  const satisfiedByNode = new Map<string, boolean>();
  for (const n of evaluation?.nodes ?? []) satisfiedByNode.set(n.nodeId, n.satisfied);

  const projectStep = (node: GateTreeNode): GuestStepView | null => {
    if (node.kind !== "CONDITION" || !node.conditionType) return null;
    const def = registry.get(node.conditionType);
    if (!def) return null; // unregistered - the gate is unprojectable

    let prompt = FALLBACK_PROMPT;
    try {
      const parsed = def.configSchema.safeParse(node.config ?? {});
      if (parsed.success) prompt = def.guestPrompt(parsed.data);
    } catch {
      prompt = FALLBACK_PROMPT;
    }

    const satisfied = satisfiedByNode.get(node.id) === true;
    const proof = proofs.get(node.id);
    const state: GuestStepState = satisfied
      ? "complete"
      : proof?.status === "PENDING_REVIEW"
        ? "in_review"
        : "needed";
    const action: GuestStepAction =
      node.conditionType === CONDITION_ANSWER_QUESTIONS && state === "needed"
        ? "apply"
        : null;

    return { nodeId: node.id, prompt, state, required: node.required, action };
  };

  const sections: GuestSectionView[] = [];

  const rootSteps: GuestStepView[] = [];
  for (const child of tree.children) {
    if (child.kind === "CONDITION") {
      const step = projectStep(child);
      if (!step) return UNAVAILABLE;
      rootSteps.push(step);
    }
  }
  if (rootSteps.length > 0) {
    sections.push({
      headline: groupHeadline(tree),
      satisfied: satisfiedByNode.get(tree.id) === true,
      steps: rootSteps,
    });
  }

  for (const child of tree.children) {
    if (child.kind !== "GROUP") continue;
    const steps: GuestStepView[] = [];
    for (const leaf of child.children) {
      const step = projectStep(leaf);
      if (!step) return UNAVAILABLE;
      steps.push(step);
    }
    if (steps.length === 0) return UNAVAILABLE;
    sections.push({
      headline: groupHeadline(child),
      satisfied: satisfiedByNode.get(child.id) === true,
      steps,
    });
  }

  if (sections.length === 0) return UNAVAILABLE;

  const open = evaluation?.open === true;
  return {
    available: true,
    open,
    headline: open ? OPEN_HEADLINE : STEPS_HEADLINE,
    needsIdentity,
    sections,
  };
}
