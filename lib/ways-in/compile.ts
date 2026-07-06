/** Ways-In compiler (Stage 17, Phase A - spec §2).
 *
 *  One-way, pure: authored list -> v3 gate spec. Never decompiles - the
 *  EventAccessModel row is the source of truth and the tree is a compile
 *  artifact (spec §2.0).
 *
 *  Shape: root GROUP(ANY_N, requiredCount:1) - any one Way In admits - with
 *  one GROUP(ALL) child per Way In (the AND-stack), conditions at depth 2.
 *  That fits the engine's validator ceiling exactly (MAX_GROUP_DEPTH = 1);
 *  nothing here may ever nest deeper without raising the ceiling.
 *
 *  Id stability: a prior CompiledMap feeds existing node ids back into the
 *  spec so updateGate's id-stable diff keeps the nodes - a guest who paid is
 *  never re-asked because the operator reworded a sibling Way In. A Way In
 *  whose requirement LIST changed shape (count or order of types) gets fresh
 *  condition nodes for the changed positions; updateGate handles the rest
 *  (same-id-same-type keeps, anything else recreates).
 */
import {
  CONDITION_ANSWER_QUESTIONS,
  CONDITION_OPEN,
  CONDITION_PAY,
  CONDITION_REFERRED_BY_MEMBER,
} from "@/lib/gate-engine/types";
import type { GateNodeSpec } from "@/lib/gate-engine/types";
import {
  PHASE_A_COMPILABLE,
  waysInListSchema,
  type CompiledMap,
  type WayIn,
  type WayInRequirement,
  type WaysInList,
} from "./schema";

export class CompileError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Ways-In list cannot compile: ${issues.join(" | ")}`);
    this.name = "CompileError";
    this.issues = issues;
  }
}

function conditionSpecFor(
  wayIn: WayIn,
  requirement: WayInRequirement,
  priorId: string | undefined,
): GateNodeSpec {
  const id = priorId ? { id: priorId } : {};
  switch (requirement.type) {
    case "pay":
      return {
        kind: "CONDITION",
        ...id,
        conditionType: CONDITION_PAY,
        config: {
          // superRefine guarantees priceCents when a pay requirement exists.
          priceCents: wayIn.priceCents as number,
          currency: "usd",
          label: wayIn.label,
          ...(requirement.availableFrom ? { availableFrom: requirement.availableFrom } : {}),
          ...(requirement.availableUntil ? { availableUntil: requirement.availableUntil } : {}),
          ...(requirement.maxQuantity !== undefined ? { maxQuantity: requirement.maxQuantity } : {}),
        },
      };
    case "apply":
      return { kind: "CONDITION", ...id, conditionType: CONDITION_ANSWER_QUESTIONS, config: {} };
    case "nothing":
      return { kind: "CONDITION", ...id, conditionType: CONDITION_OPEN, config: {} };
    case "referred":
      return { kind: "CONDITION", ...id, conditionType: CONDITION_REFERRED_BY_MEMBER, config: {} };
    case "screening":
      // Reserved in the model (schema.ts), deliberately not compilable yet:
      // COLLECT_INFO collects, it does not screen - deferred to Phase C.
      throw new CompileError([
        `Way In "${wayIn.label}": 'screening' is not available yet - it lands with the Phase C engine additions.`,
      ]);
  }
}

/** Compile the authored list to a gate spec. Throws CompileError on an
 *  invalid or not-yet-expressible list - never emits a partial tree
 *  (fail-closed, matching the engine's own posture). */
export function compileWaysIn(
  input: WaysInList,
  priorMap?: CompiledMap | null,
): GateNodeSpec {
  const parsed = waysInListSchema.safeParse(input);
  if (!parsed.success) {
    throw new CompileError(parsed.error.issues.map((i) => i.message));
  }
  const list = parsed.data;

  const unsupported = list.flatMap((w) =>
    w.requirements
      .filter((r) => !PHASE_A_COMPILABLE.has(r.type))
      .map((r) => `Way In "${w.label}": '${r.type}' is not available yet - it lands with the Phase C engine additions.`),
  );
  if (unsupported.length > 0) throw new CompileError(unsupported);

  const children: GateNodeSpec[] = list.map((wayIn) => {
    const prior = priorMap?.wayIns[wayIn.id];
    return {
      kind: "GROUP",
      ...(prior ? { id: prior.groupNodeId } : {}),
      rule: "ALL",
      children: wayIn.requirements.map((requirement, i) =>
        conditionSpecFor(wayIn, requirement, prior?.conditionNodeIds[i]),
      ),
    };
  });

  return {
    kind: "GROUP",
    ...(priorMap?.rootNodeId ? { id: priorMap.rootNodeId } : {}),
    rule: "ANY_N",
    requiredCount: 1,
    children,
  };
}
