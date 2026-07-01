/** GrowthEdge write path (Stage 17).
 *
 *  M1 writes REFERRAL edges when REFERRED_BY_MEMBER is satisfied. Everything
 *  is workspace-scoped; there are NO cross-tenant reads anywhere. One edge
 *  per (workspace, type, from, to) - repeat satisfactions do not multiply
 *  edges (proof history carries the per-event record). Shaped so
 *  per-workspace network aggregation is possible later.
 */
import type { GateResourceType, PrismaClient } from "@prisma/client";
import type { GrowthEdgeWrite } from "./types";

export async function recordGrowthEdge(
  db: PrismaClient,
  args: {
    workspaceId: string;
    edge: GrowthEdgeWrite;
    resourceType?: GateResourceType;
    resourceId?: string;
    proofId?: string;
  }
): Promise<void> {
  const existing = await db.growthEdge.findFirst({
    where: {
      workspaceId: args.workspaceId,
      type: args.edge.type,
      fromMemberId: args.edge.fromMemberId,
      toMemberId: args.edge.toMemberId,
    },
    select: { id: true },
  });
  if (existing) return; // dedup: first edge wins

  await db.growthEdge.create({
    data: {
      workspaceId: args.workspaceId,
      type: args.edge.type,
      fromMemberId: args.edge.fromMemberId,
      toMemberId: args.edge.toMemberId,
      resourceType: args.resourceType ?? null,
      resourceId: args.resourceId ?? null,
      proofId: args.proofId ?? null,
    },
  });
}
