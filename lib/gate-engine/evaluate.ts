/** The recursive gate evaluator - pure core (Stage 17).
 *
 *  Written once, correct at every depth. This function is total: it never
 *  throws, performs no I/O, and reads no clocks (`now` is a parameter).
 *  Semantics (normative, encoded by tests/unit/gate-engine/evaluate.test.ts):
 *
 *  - CONDITION: satisfied iff a proof exists for the node with status
 *    SATISFIED and (expiresAt null or > now). Position-agnostic.
 *  - GROUP: children evaluate first. Every `required: true` child must be
 *    satisfied or the group fails regardless of rule. Then ALL = every child;
 *    ANY_N = satisfied children >= requiredCount; WEIGHTED = summed weight of
 *    satisfied children >= weightThreshold.
 *  - Fail-closed: any structural violation ANYWHERE in the tree (depth beyond
 *    the §16.1 ceiling, empty or rule-less group, condition at root, missing
 *    or unregistered conditionType, condition with children) closes the whole
 *    gate even if the root would otherwise be satisfied. A partially
 *    malformed tree is ambiguity about operator intent; ambiguity is never
 *    Open.
 */
import type {
  GateEvaluation,
  GateTreeNode,
  NodeEvaluation,
  NodeReasonCode,
  ProofIndex,
} from "./types";
import { MAX_CONDITION_DEPTH, MAX_GROUP_DEPTH } from "./validate";

export type EvaluateOptions = {
  now: Date;
  registeredTypes: ReadonlySet<string>;
};

type EvalCtx = {
  proofs: ProofIndex;
  opts: EvaluateOptions;
  nodes: NodeEvaluation[];
  structuralViolation: boolean;
};

export function evaluateTree(
  root: GateTreeNode | null,
  proofs: ProofIndex,
  opts: EvaluateOptions
): GateEvaluation {
  if (!root) {
    return { open: false, structuralViolation: true, nodes: [] };
  }
  const ctx: EvalCtx = { proofs, opts, nodes: [], structuralViolation: false };
  const rootSatisfied = evalNode(root, 0, ctx);
  return {
    open: rootSatisfied && !ctx.structuralViolation,
    structuralViolation: ctx.structuralViolation,
    nodes: ctx.nodes,
  };
}

function record(
  ctx: EvalCtx,
  nodeId: string,
  satisfied: boolean,
  reason: NodeReasonCode,
  structural = false
): boolean {
  if (structural) ctx.structuralViolation = true;
  ctx.nodes.push({ nodeId, satisfied, reason });
  return satisfied;
}

function evalNode(node: GateTreeNode, depth: number, ctx: EvalCtx): boolean {
  if (node.kind === "GROUP") {
    if (depth > MAX_GROUP_DEPTH) {
      // Do not recurse into an over-deep subtree - bounded work on any input.
      return record(ctx, node.id, false, "DEPTH_EXCEEDED", true);
    }
    if (node.children.length === 0) {
      return record(ctx, node.id, false, "EMPTY_GROUP", true);
    }

    const childResults = node.children.map((child) => ({
      required: child.required,
      weight: child.weight,
      satisfied: evalNode(child, depth + 1, ctx),
    }));

    const requiredOk = childResults
      .filter((c) => c.required)
      .every((c) => c.satisfied);
    const satisfiedCount = childResults.filter((c) => c.satisfied).length;

    let ruleOk: boolean;
    switch (node.rule) {
      case "ALL":
        ruleOk = satisfiedCount === node.children.length;
        break;
      case "ANY_N":
        if (node.requiredCount == null || node.requiredCount < 1) {
          return record(ctx, node.id, false, "MALFORMED_NODE", true);
        }
        ruleOk = satisfiedCount >= node.requiredCount;
        break;
      case "WEIGHTED": {
        if (node.weightThreshold == null || node.weightThreshold < 1) {
          return record(ctx, node.id, false, "MALFORMED_NODE", true);
        }
        const weightSum = childResults.reduce(
          (sum, c) => sum + (c.satisfied ? c.weight ?? 0 : 0),
          0
        );
        ruleOk = weightSum >= node.weightThreshold;
        break;
      }
      default:
        return record(ctx, node.id, false, "MALFORMED_NODE", true);
    }

    if (!requiredOk) {
      return record(ctx, node.id, false, "REQUIRED_CHILD_UNSATISFIED");
    }
    return ruleOk
      ? record(ctx, node.id, true, "GROUP_SATISFIED")
      : record(ctx, node.id, false, "RULE_UNMET");
  }

  // CONDITION leaf
  if (depth === 0) {
    return record(ctx, node.id, false, "ROOT_NOT_GROUP", true);
  }
  if (depth > MAX_CONDITION_DEPTH) {
    return record(ctx, node.id, false, "DEPTH_EXCEEDED", true);
  }
  if (node.children.length > 0) {
    return record(ctx, node.id, false, "MALFORMED_NODE", true);
  }
  if (!node.conditionType) {
    return record(ctx, node.id, false, "MALFORMED_NODE", true);
  }
  if (!ctx.opts.registeredTypes.has(node.conditionType)) {
    return record(ctx, node.id, false, "UNREGISTERED_CONDITION", true);
  }

  const proof = ctx.proofs.get(node.id);
  if (!proof) {
    return record(ctx, node.id, false, "NO_PROOF");
  }
  if (proof.status !== "SATISFIED") {
    return record(ctx, node.id, false, "PROOF_NOT_SATISFIED");
  }
  if (proof.expiresAt !== null && proof.expiresAt.getTime() <= ctx.opts.now.getTime()) {
    return record(ctx, node.id, false, "PROOF_EXPIRED");
  }
  return record(ctx, node.id, true, "SATISFIED_BY_PROOF");
}
