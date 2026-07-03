/** GateProof persistence + carry-forward (Stage 17).
 *
 *  One LIVE proof per (nodeId, memberId) - a re-verification updates the row
 *  in place. Tier and mechanism are stamped from the condition contract by
 *  the orchestrator, never taken from a verifier's return value.
 *
 *  Carry-forward (§16.4, LOCKED except the HOLD_MEMBERSHIP unlock): on
 *  landing, a returning member's prior satisfied proofs pre-satisfy matching
 *  conditions without re-verifying. Implementation is copy-on-landing: mint a
 *  node-anchored proof from the most recent live source proof, copying tier,
 *  mechanism, payload, verifiedAt AND the ORIGINAL expiresAt (the 12-month
 *  answers window never refreshes on carry), with sourceProofId lineage.
 *  Conservative rule: a node that already has ANY proof row (live, expired,
 *  rejected, or pending) is never overwritten by carry-forward - fresher
 *  local history beats older remote history.
 */
import { Prisma } from "@prisma/client";
import type { GateProof, PrismaClient } from "@prisma/client";
import type { ConditionRegistry } from "./registry";
import type { CarryForwardPolicy, GateTreeNode, ProofIndex } from "./types";

/** UTC-safe month addition (no date-fns in this repo - hand-rolled; month-end
 *  overflow rolls forward per JS Date semantics, documented + tested). */
export function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Expiry is a function of the carry-forward policy at verification time. */
export function computeExpiry(
  policy: CarryForwardPolicy,
  verifiedAt: Date
): Date | null {
  if (policy.kind === "MONTHS") return addMonthsUtc(verifiedAt, policy.months);
  return null;
}

export function isProofLive(
  proof: { status: string; expiresAt: Date | null },
  now: Date
): boolean {
  if (proof.status !== "SATISFIED") return false;
  if (proof.expiresAt !== null && proof.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export type ProofWrite = {
  workspaceId: string;
  nodeId: string;
  memberId: string;
  conditionType: string;
  status: "SATISFIED" | "REJECTED" | "PENDING_REVIEW";
  tier: GateProof["tier"];
  mechanism: GateProof["mechanism"];
  payload: Record<string, unknown> | null;
  sourceProofId: string | null;
  verifiedAt: Date;
  expiresAt: Date | null;
};

/** Upsert honoring the (nodeId, memberId) unique. Implemented as
 *  find-then-write because the compound unique contains a nullable column. */
export async function writeNodeProof(
  db: PrismaClient,
  write: ProofWrite
): Promise<GateProof> {
  const existing = await db.gateProof.findFirst({
    where: { nodeId: write.nodeId, memberId: write.memberId },
  });
  const data = {
    workspaceId: write.workspaceId,
    nodeId: write.nodeId,
    memberId: write.memberId,
    conditionType: write.conditionType,
    status: write.status,
    tier: write.tier,
    mechanism: write.mechanism,
    payload:
      write.payload === null
        ? Prisma.JsonNull
        : (write.payload as Prisma.InputJsonValue),
    sourceProofId: write.sourceProofId,
    verifiedAt: write.verifiedAt,
    expiresAt: write.expiresAt,
  };
  if (existing) {
    return db.gateProof.update({ where: { id: existing.id }, data });
  }
  return db.gateProof.create({ data });
}

/** Pure decision: does this policy carry prior proofs forward at all? */
export function policyCarries(policy: CarryForwardPolicy): boolean {
  return policy.kind === "ALWAYS" || policy.kind === "MONTHS";
}

/** On landing: for every condition node with NO proof row for this member,
 *  mint a carried proof from the most recent live source proof of the same
 *  conditionType anywhere in the workspace. PAY (NEVER) and HOLD_MEMBERSHIP
 *  (LIVE) never carry. */
export async function carryForwardForNodes(
  db: PrismaClient,
  args: {
    workspaceId: string;
    memberId: string;
    conditionNodes: GateTreeNode[];
    registry: ConditionRegistry;
    now: Date;
  }
): Promise<void> {
  for (const node of args.conditionNodes) {
    if (!node.conditionType) continue;
    const def = args.registry.get(node.conditionType);
    if (!def || !policyCarries(def.carryForward)) continue;

    const existing = await db.gateProof.findFirst({
      where: { nodeId: node.id, memberId: args.memberId },
      select: { id: true },
    });
    if (existing) continue; // never overwrite local history

    const source = await db.gateProof.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        conditionType: node.conditionType,
        status: "SATISFIED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: args.now } }],
      },
      orderBy: { verifiedAt: "desc" },
    });
    if (!source) continue;

    await db.gateProof.create({
      data: {
        workspaceId: args.workspaceId,
        nodeId: node.id,
        memberId: args.memberId,
        conditionType: node.conditionType,
        status: "SATISFIED",
        tier: source.tier,
        mechanism: source.mechanism,
        payload:
          source.payload === null
            ? Prisma.JsonNull
            : (source.payload as Prisma.InputJsonValue),
        sourceProofId: source.id,
        verifiedAt: source.verifiedAt,
        expiresAt: source.expiresAt,
      },
    });
  }
}

/** Load the member's proofs for a set of nodes into the evaluator's index. */
export async function loadProofIndex(
  db: PrismaClient,
  args: { memberId: string; nodeIds: string[] }
): Promise<ProofIndex> {
  if (args.nodeIds.length === 0) return new Map();
  const rows = await db.gateProof.findMany({
    where: { memberId: args.memberId, nodeId: { in: args.nodeIds } },
    select: { nodeId: true, status: true, expiresAt: true },
  });
  const index: ProofIndex = new Map();
  for (const row of rows) {
    if (row.nodeId === null) continue;
    index.set(row.nodeId, { status: row.status, expiresAt: row.expiresAt });
  }
  return index;
}
