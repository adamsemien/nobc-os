/** Authoring-time gate tree validation (Stage 17).
 *
 *  The database cannot enforce tree shape; this validator is the authoring
 *  boundary and the evaluator re-enforces the same ceilings at evaluation
 *  time (defense in depth, fail-closed). Rules:
 *
 *  - The root must be a GROUP (OR is ANY_N with requiredCount 1; a
 *    single-condition gate is a root ALL group with one child).
 *  - Depth ceiling (§16.1, LOCKED): groups at depth <= 1, conditions at
 *    depth <= 2 (root = depth 0). "Flat + depth-2."
 *  - Groups must have children; ANY_N needs 1 <= requiredCount <= children;
 *    WEIGHTED needs weightThreshold >= 1 and must be satisfiable by the
 *    children's declared weights.
 *  - Rule-mismatched fields are rejected (strict authoring hygiene).
 *  - Every condition must be registered and its config must pass the type's
 *    Zod schema - no type is usable until its verifier exists.
 */
import type { ConditionRegistry } from "./registry";
import type { GateNodeSpec } from "./types";

export const MAX_GROUP_DEPTH = 1;
export const MAX_CONDITION_DEPTH = 2;

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export function validateGateSpec(
  root: GateNodeSpec,
  registry: ConditionRegistry
): ValidationResult {
  const errors: string[] = [];

  if (root.kind !== "GROUP") {
    errors.push("root: must be a GROUP node");
    return { valid: false, errors };
  }

  walk(root, 0, "root", registry, errors);
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function walk(
  node: GateNodeSpec,
  depth: number,
  path: string,
  registry: ConditionRegistry,
  errors: string[]
): void {
  if (node.kind === "GROUP") {
    if (depth > MAX_GROUP_DEPTH) {
      errors.push(`${path}: GROUP exceeds the depth ceiling (groups at depth <= ${MAX_GROUP_DEPTH})`);
      return;
    }
    if (!Array.isArray(node.children) || node.children.length === 0) {
      errors.push(`${path}: GROUP must have at least one child`);
      return;
    }

    if (node.rule === "ANY_N") {
      if (node.weightThreshold !== undefined) {
        errors.push(`${path}: weightThreshold is only valid on WEIGHTED groups`);
      }
      if (
        node.requiredCount === undefined ||
        !Number.isInteger(node.requiredCount) ||
        node.requiredCount < 1
      ) {
        errors.push(`${path}: ANY_N requires an integer requiredCount >= 1`);
      } else if (node.requiredCount > node.children.length) {
        errors.push(
          `${path}: ANY_N requiredCount (${node.requiredCount}) exceeds child count (${node.children.length}) - unsatisfiable`
        );
      }
    } else if (node.rule === "WEIGHTED") {
      if (node.requiredCount !== undefined) {
        errors.push(`${path}: requiredCount is only valid on ANY_N groups`);
      }
      if (
        node.weightThreshold === undefined ||
        !Number.isInteger(node.weightThreshold) ||
        node.weightThreshold < 1
      ) {
        errors.push(`${path}: WEIGHTED requires an integer weightThreshold >= 1`);
      } else {
        const reachable = node.children.reduce(
          (sum, child) => sum + (child.weight ?? 0),
          0
        );
        if (reachable < node.weightThreshold) {
          errors.push(
            `${path}: WEIGHTED threshold (${node.weightThreshold}) exceeds the children's total weight (${reachable}) - unsatisfiable`
          );
        }
      }
    } else if (node.rule === "ALL") {
      if (node.requiredCount !== undefined) {
        errors.push(`${path}: requiredCount is only valid on ANY_N groups`);
      }
      if (node.weightThreshold !== undefined) {
        errors.push(`${path}: weightThreshold is only valid on WEIGHTED groups`);
      }
    } else {
      errors.push(`${path}: GROUP has an unknown rule`);
    }

    node.children.forEach((child, i) => {
      if (node.rule !== "WEIGHTED" && child.weight !== undefined) {
        errors.push(`${path}.children[${i}]: weight is only valid inside a WEIGHTED group`);
      }
      if (node.rule === "WEIGHTED" && child.weight !== undefined) {
        if (!Number.isInteger(child.weight) || child.weight < 1) {
          errors.push(`${path}.children[${i}]: weight must be an integer >= 1`);
        }
      }
      walk(child, depth + 1, `${path}.children[${i}]`, registry, errors);
    });
    return;
  }

  // CONDITION
  if (depth > MAX_CONDITION_DEPTH) {
    errors.push(`${path}: CONDITION exceeds the depth ceiling (conditions at depth <= ${MAX_CONDITION_DEPTH})`);
    return;
  }
  const def = registry.get(node.conditionType);
  if (!def) {
    errors.push(`${path}: condition type "${node.conditionType}" is not registered (no verifier, no type)`);
    return;
  }
  const parsed = def.configSchema.safeParse(node.config ?? {});
  if (!parsed.success) {
    errors.push(`${path}: config is invalid for "${node.conditionType}" - ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
}
