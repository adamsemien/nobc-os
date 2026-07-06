/** Compile-on-save (Stage 17, Phase A - spec §2.0).
 *
 *  saveWaysIn = validate -> compile (with prior node ids) -> write the tree
 *  through the ENGINE AUTHORING API (createGate/updateGate - never engine
 *  internals) -> re-load the stored tree -> persist the document + compile
 *  bookkeeping (hash, wayInId->nodeId map, compiledAt).
 *
 *  Phase A ships this dark: no production surface calls it yet (the Ways-In
 *  UI and verbs are Phase B). Failure between the gate write and the row
 *  write leaves the stored hash stale -> the event reads as "advanced" -
 *  fail-closed in the safe direction (read-only UI), self-heals on the next
 *  successful save.
 *
 *  Dependencies are injected ({ db, engine }) matching the engine's own test
 *  pattern; production callers pass lib/db + getGateEngine().
 */
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import type { GateTreeNode } from "@/lib/gate-engine/types";
import { hashGateTree } from "./advanced";
import { compileWaysIn } from "./compile";
import {
  compiledMapSchema,
  waysInListSchema,
  type CompiledMap,
  type WaysInList,
} from "./schema";

export type SaveWaysInResult = {
  gateId: string;
  compiledTreeHash: string;
  compiledMap: CompiledMap;
};

/** Read the stored tree back into the wayInId -> node-id map. The compiler
 *  wrote root children in list order and conditions in requirement order, so
 *  position (the loaders' sort key) recovers the correspondence exactly. */
export function mapCompiledTree(list: WaysInList, tree: GateTreeNode): CompiledMap {
  const wayIns: CompiledMap["wayIns"] = {};
  list.forEach((wayIn, i) => {
    const group = tree.children[i];
    if (!group) return; // defensive: a short tree just maps fewer entries
    wayIns[wayIn.id] = {
      groupNodeId: group.id,
      conditionNodeIds: group.children.map((c) => c.id),
    };
  });
  return { rootNodeId: tree.id, wayIns };
}

export async function saveWaysIn(
  deps: { db: PrismaClient; engine: GateEngine },
  args: { workspaceId: string; eventId: string; waysIn: WaysInList },
): Promise<SaveWaysInResult> {
  const { db, engine } = deps;
  const list = waysInListSchema.parse(args.waysIn);

  // Workspace scoping is the security boundary: the upsert below keys on the
  // globally-unique eventId, so prove ownership before any write.
  const event = await db.event.findFirst({
    where: { id: args.eventId, workspaceId: args.workspaceId },
    select: { id: true },
  });
  if (!event) {
    throw new Error(`[ways-in] event ${args.eventId} not found in workspace ${args.workspaceId}`);
  }

  // Prior compile map (if any) feeds node ids forward so proofs survive.
  const existingRow = await db.eventAccessModel.findFirst({
    where: { eventId: args.eventId, workspaceId: args.workspaceId },
    select: { compiledMap: true },
  });
  const priorMap = existingRow?.compiledMap
    ? compiledMapSchema.safeParse(existingRow.compiledMap)
    : null;

  const spec = compileWaysIn(list, priorMap?.success ? priorMap.data : null);

  const existingGate = await engine.getGateForResource({
    workspaceId: args.workspaceId,
    resource: { type: "EVENT", id: args.eventId },
  });
  let gateId: string;
  if (existingGate) {
    await engine.updateGate({
      workspaceId: args.workspaceId,
      gateId: existingGate.gateId,
      spec,
    });
    gateId = existingGate.gateId;
  } else {
    const created = await engine.createGate({
      workspaceId: args.workspaceId,
      resource: { type: "EVENT", id: args.eventId },
      spec,
    });
    gateId = created.gateId;
  }

  // Canonical ids + shape come from the STORED tree, never the draft spec.
  const stored = await engine.getGateForResource({
    workspaceId: args.workspaceId,
    resource: { type: "EVENT", id: args.eventId },
  });
  if (!stored?.tree) {
    throw new Error(
      `[ways-in] compiled gate ${gateId} re-loaded malformed for event ${args.eventId} - document not saved, gate flagged advanced until the next successful save`,
    );
  }
  const compiledTreeHash = hashGateTree(stored.tree);
  const compiledMap = mapCompiledTree(list, stored.tree);

  await db.eventAccessModel.upsert({
    where: { eventId: args.eventId },
    create: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      waysIn: list,
      compiledTreeHash,
      compiledMap,
      compiledAt: new Date(),
    },
    update: {
      waysIn: list,
      compiledTreeHash,
      compiledMap,
      compiledAt: new Date(),
    },
  });

  return { gateId, compiledTreeHash, compiledMap };
}
