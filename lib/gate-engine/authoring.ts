/** Gate authoring surface (Stage 17, M3 Builder).
 *
 *  Read / update / delete for gate trees, built for the operator Builder.
 *  The load-bearing decision here is that updateGate is an ID-STABLE DIFF,
 *  not delete-and-recreate (M3-D1): a spec node carrying the id of an
 *  existing node - same workspace, same gate, same kind, and for conditions
 *  the same conditionType - is updated in place, so proofs already earned on
 *  that node survive the edit. A guest who paid must never be asked to pay
 *  again because an operator reworded a sibling step. Nodes absent from the
 *  new spec are deleted; their proofs detach (GateProof.nodeId -> null) but
 *  keep their denormalized conditionType, so carry-forward history is intact.
 *
 *  The conditionType match on kept nodes is a hard rule (M3-D2): proofs are
 *  read by nodeId at evaluation time, so honoring an id across a type change
 *  would let a PAY proof satisfy an ATTENDED_PRIOR node. A type change is a
 *  new node, full stop.
 */
import type { GateNode, GateResourceType, PrismaClient } from "@prisma/client";
import type { ConditionRegistry } from "./registry";
import type { GateNodeSpec, GateTreeNode } from "./types";
import { validateGateSpec } from "./validate";

export class GateAuthoringError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Gate spec failed validation: ${errors.join(" | ")}`);
    this.name = "GateAuthoringError";
    this.errors = errors;
  }
}

export function toTreeNode(row: GateNode): GateTreeNode {
  return {
    id: row.id,
    kind: row.kind,
    required: row.required,
    weight: row.weight,
    rule: row.rule,
    requiredCount: row.requiredCount,
    weightThreshold: row.weightThreshold,
    children: [],
    conditionType: row.conditionType,
    config: row.config,
  };
}

export function buildTree(rows: GateNode[], rootId: string): GateTreeNode | null {
  const byId = new Map<string, GateTreeNode>();
  for (const row of rows) byId.set(row.id, toTreeNode(row));
  for (const row of rows) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    const child = byId.get(row.id);
    if (parent && child) parent.children.push(child);
  }
  return byId.get(rootId) ?? null;
}

/** An ephemeral, never-persisted tree from a draft spec, for the Builder's
 *  live preview. Ids are synthetic - the projector only needs them to key
 *  steps. Existing node ids are preserved when present so preview state can
 *  be correlated with the stored tree. */
export function specToPreviewTree(spec: GateNodeSpec, path = "preview-0"): GateTreeNode {
  return {
    id: spec.id ?? path,
    kind: spec.kind,
    required: spec.required ?? false,
    weight: spec.weight ?? null,
    rule: spec.kind === "GROUP" ? spec.rule : null,
    requiredCount: spec.kind === "GROUP" ? spec.requiredCount ?? null : null,
    weightThreshold: spec.kind === "GROUP" ? spec.weightThreshold ?? null : null,
    children:
      spec.kind === "GROUP"
        ? spec.children.map((child, i) => specToPreviewTree(child, `${path}.${i}`))
        : [],
    conditionType: spec.kind === "CONDITION" ? spec.conditionType : null,
    config: spec.kind === "CONDITION" ? spec.config ?? {} : null,
  };
}

export type LoadedGate = {
  gateId: string;
  name: string | null;
  /** Materialized tree with node ids - the Builder round-trips these ids and
   *  the preview projector eats this shape directly. Null when the stored
   *  tree is malformed (no root / multiple roots) - fail-closed, never a
   *  partial tree. */
  tree: GateTreeNode | null;
};

export async function getGateForResource(
  db: PrismaClient,
  args: {
    workspaceId: string;
    resource: { type: GateResourceType; id: string };
  }
): Promise<LoadedGate | null> {
  const gate = await db.gate.findFirst({
    where: {
      workspaceId: args.workspaceId,
      resourceType: args.resource.type,
      resourceId: args.resource.id,
    },
  });
  if (!gate) return null;
  const rows = await db.gateNode.findMany({
    where: { gateId: gate.id, workspaceId: args.workspaceId },
    orderBy: { position: "asc" },
  });
  const roots = rows.filter((r) => r.parentId === null);
  if (roots.length !== 1) {
    console.error("[gate-engine] stored gate tree is malformed", {
      gateId: gate.id,
      workspaceId: args.workspaceId,
      rootCount: roots.length,
    });
    return { gateId: gate.id, name: gate.name, tree: null };
  }
  return { gateId: gate.id, name: gate.name, tree: buildTree(rows, roots[0].id) };
}

export async function updateGate(
  db: PrismaClient,
  registry: ConditionRegistry,
  args: {
    workspaceId: string;
    gateId: string;
    name?: string | null;
    spec: GateNodeSpec;
  }
): Promise<{ rootNodeId: string }> {
  const result = validateGateSpec(args.spec, registry);
  if (!result.valid) throw new GateAuthoringError(result.errors);

  return db.$transaction(async (tx) => {
    const gate = await tx.gate.findFirst({
      where: { id: args.gateId, workspaceId: args.workspaceId },
      select: { id: true },
    });
    if (!gate) throw new GateAuthoringError(["Gate not found in this workspace."]);
    const gateId = gate.id;

    const existing = await tx.gateNode.findMany({
      where: { gateId, workspaceId: args.workspaceId },
    });
    const existingById = new Map(existing.map((row) => [row.id, row]));
    const keptIds = new Set<string>();

    // Top-down walk: parents are created/updated before their children, so a
    // child's parentId always references a row that already exists.
    async function upsertNode(
      spec: GateNodeSpec,
      parentId: string | null,
      position: number
    ): Promise<string> {
      const claimed = spec.id ? existingById.get(spec.id) : undefined;
      const keepable =
        claimed !== undefined &&
        !keptIds.has(claimed.id) &&
        claimed.kind === spec.kind &&
        (spec.kind !== "CONDITION" || claimed.conditionType === spec.conditionType);

      const data = {
        parentId,
        position,
        required: spec.required ?? false,
        weight: spec.weight ?? null,
        rule: spec.kind === "GROUP" ? spec.rule : null,
        requiredCount: spec.kind === "GROUP" ? spec.requiredCount ?? null : null,
        weightThreshold: spec.kind === "GROUP" ? spec.weightThreshold ?? null : null,
        config:
          spec.kind === "CONDITION" && spec.config !== undefined
            ? (spec.config as object)
            : undefined,
      };

      let nodeId: string;
      if (keepable) {
        keptIds.add(claimed.id);
        await tx.gateNode.update({ where: { id: claimed.id }, data });
        nodeId = claimed.id;
      } else {
        const created = await tx.gateNode.create({
          data: {
            ...data,
            workspaceId: args.workspaceId,
            gateId,
            kind: spec.kind,
            conditionType: spec.kind === "CONDITION" ? spec.conditionType : null,
          },
        });
        nodeId = created.id;
      }

      if (spec.kind === "GROUP") {
        for (let i = 0; i < spec.children.length; i++) {
          await upsertNode(spec.children[i], nodeId, i);
        }
      }
      return nodeId;
    }

    const rootNodeId = await upsertNode(args.spec, null, 0);

    // Kept nodes were re-parented above, so deleting the removed set can only
    // cascade into other removed nodes, never into kept ones.
    const removed = existing.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
    if (removed.length > 0) {
      await tx.gateNode.deleteMany({
        where: { id: { in: removed }, gateId, workspaceId: args.workspaceId },
      });
    }

    if (args.name !== undefined) {
      await tx.gate.update({ where: { id: gateId }, data: { name: args.name } });
    }

    return { rootNodeId };
  });
}

/** Deletes the gate; nodes and sessions cascade at the database level, proofs
 *  detach (nodeId -> null) with their conditionType history intact. Returns
 *  false when no such gate exists in the workspace. */
export async function deleteGate(
  db: PrismaClient,
  args: { workspaceId: string; gateId: string }
): Promise<boolean> {
  const res = await db.gate.deleteMany({
    where: { id: args.gateId, workspaceId: args.workspaceId },
  });
  return res.count > 0;
}
