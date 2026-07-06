/** Price-tier derivation (Stage 17, Phase A - spec §2.4).
 *
 *  "Access granted carries the resolved price tier": given a gate
 *  evaluation, derive WHICH Way In satisfied it - and its price when the
 *  path is paid. Pure; consumed by the Phase-B revenue re-point and by any
 *  emitter that wants the winning path on its metadata.
 *
 *  Rule: a Way In is satisfied when its compiled GROUP node evaluated
 *  satisfied. List order is priority - the WINNER is the first satisfied
 *  Way In in document order (ties are real: an open path and a paid path
 *  can both be satisfied; the document order says which one names the tier).
 */
import type { GateEvaluation } from "@/lib/gate-engine/types";
import type { CompiledMap, WaysInList } from "./schema";

export type SatisfiedWayIn = {
  wayInId: string;
  label: string;
  /** The authored price when this Way In carries a pay requirement. */
  priceCents: number | null;
};

export type WayInDerivation = {
  /** First satisfied Way In in document order, or null when none resolved
   *  (evaluation not open, unmapped tree, or a hand-edited/advanced gate). */
  winner: SatisfiedWayIn | null;
  /** Every satisfied Way In, in document order. */
  satisfied: SatisfiedWayIn[];
};

export function deriveSatisfiedWayIn(
  list: WaysInList,
  compiledMap: CompiledMap,
  evaluation: GateEvaluation,
): WayInDerivation {
  const satisfiedNodeIds = new Set(
    evaluation.nodes.filter((n) => n.satisfied).map((n) => n.nodeId),
  );

  const satisfied: SatisfiedWayIn[] = [];
  for (const wayIn of list) {
    const mapped = compiledMap.wayIns[wayIn.id];
    if (!mapped) continue; // not in the last compile (advanced/stale) - skip
    if (!satisfiedNodeIds.has(mapped.groupNodeId)) continue;
    satisfied.push({
      wayInId: wayIn.id,
      label: wayIn.label,
      priceCents: wayIn.priceCents ?? null,
    });
  }

  return { winner: satisfied[0] ?? null, satisfied };
}
