/** Advanced-gate flag (Stage 17, Phase A - spec §2.0).
 *
 *  The compiler stores a hash of the tree it wrote; a live tree whose hash
 *  differs was hand-edited (GateBuilderTab) and the event is "advanced":
 *  the Ways-In view goes read-only for it and the raw editor owns it.
 *
 *  The hash covers SEMANTIC shape only - kind/rule/thresholds/required/
 *  weight/conditionType/config in position order - and deliberately excludes
 *  node ids: a hand edit that changes nothing semantic is not "advanced",
 *  and false flags are UX noise. Ambiguity resolves TO advanced (read-only
 *  is the safe state), matching the engine's fail-closed posture.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getGateForResource } from "@/lib/gate-engine/authoring";
import type { GateTreeNode } from "@/lib/gate-engine/types";

/** Deterministic JSON: objects get sorted keys at every depth. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function semanticShape(node: GateTreeNode): unknown {
  return {
    kind: node.kind,
    rule: node.rule,
    requiredCount: node.requiredCount,
    weightThreshold: node.weightThreshold,
    required: node.required,
    weight: node.weight,
    conditionType: node.conditionType,
    config: node.config ?? null,
    children: node.children.map(semanticShape),
  };
}

export function hashGateTree(tree: GateTreeNode): string {
  return createHash("sha256").update(canonicalJson(semanticShape(tree))).digest("hex");
}

export type AdvancedGateStatus = {
  advanced: boolean;
  reason:
    | "MATCHES_COMPILE" // tree hash equals the stored compile hash
    | "HAND_EDITED" // tree exists and differs from the last compile
    | "NO_MODEL" // a gate exists but no Ways-In document does (hand-authored)
    | "GATE_MISSING" // the model compiled once but its gate is gone/malformed
    | "NOT_COMPILED"; // model (or nothing) exists, never compiled - nothing to disagree
};

/** Is this event's gate hand-edited beyond what the Ways-In list authored? */
export async function getAdvancedGateStatus(
  db: PrismaClient,
  args: { workspaceId: string; eventId: string },
): Promise<AdvancedGateStatus> {
  const model = await db.eventAccessModel.findFirst({
    where: { eventId: args.eventId, workspaceId: args.workspaceId },
    select: { compiledTreeHash: true },
  });
  const gate = await getGateForResource(db, {
    workspaceId: args.workspaceId,
    resource: { type: "EVENT", id: args.eventId },
  });

  if (!gate) {
    if (model?.compiledTreeHash) {
      // We compiled a tree and it is gone (or unloadable) - a hand action.
      return { advanced: true, reason: "GATE_MISSING" };
    }
    return { advanced: false, reason: "NOT_COMPILED" };
  }
  if (!gate.tree) {
    // Stored tree is malformed (no root / multiple roots) - fail closed.
    return { advanced: true, reason: "GATE_MISSING" };
  }
  if (!model?.compiledTreeHash) {
    // A gate with no Ways-In document behind it was authored by hand.
    return { advanced: true, reason: "NO_MODEL" };
  }
  return hashGateTree(gate.tree) === model.compiledTreeHash
    ? { advanced: false, reason: "MATCHES_COMPILE" }
    : { advanced: true, reason: "HAND_EDITED" };
}
