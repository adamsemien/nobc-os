/** The effectful gate orchestrator (Stage 17).
 *
 *  Wraps the pure evaluator with workspace-scoped I/O:
 *  load gate + tree + member -> carry-forward -> run submitted + passive
 *  verifications -> build the proof index -> pure evaluate -> snapshot to the
 *  session. Every read is workspace-scoped. Every failure path is
 *  fail-closed: errors are logged with context and evaluate to NOT Open;
 *  nothing on the grant path throws.
 *
 *  LIVE policy (HOLD_MEMBERSHIP, unlocked 2026-07-01): re-verified on every
 *  evaluation. The evaluation uses THIS run's outcome only - if a LIVE
 *  verifier errors, the node counts as unproven this run even when an older
 *  satisfied row exists (a revoked or red-listed member must never pass on a
 *  stale proof).
 *
 *  Established-truth guard: a node whose current proof is live SATISFIED is
 *  not re-run for non-LIVE types (we never re-verify what we already know,
 *  and a junk re-submission can never downgrade a real payment).
 */
import type { GateNode, GateResourceType, Member, PrismaClient } from "@prisma/client";
import { evaluateTree } from "./evaluate";
import { recordGrowthEdge } from "./growth";
import type { ConditionRegistry } from "./registry";
import {
  carryForwardForNodes,
  computeExpiry,
  isProofLive,
  loadProofIndex,
  writeNodeProof,
} from "./proofs";
import type {
  GateDecision,
  GateNodeSpec,
  GateTreeNode,
  ProofSnapshot,
  VerifyOutcome,
} from "./types";
import { validateGateSpec } from "./validate";

export class GateAuthoringError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Gate spec failed validation: ${errors.join(" | ")}`);
    this.name = "GateAuthoringError";
    this.errors = errors;
  }
}

export type EvaluateGateArgs = {
  workspaceId: string;
  gateId: string;
  memberId: string;
  /** nodeId -> submission payload for member-initiated verifications. */
  submissions?: Record<string, unknown>;
  /** Optional GateSession to snapshot the decision onto. */
  sessionId?: string;
  now?: Date;
};

export type GateEngine = {
  createGate(args: {
    workspaceId: string;
    resource: { type: "EVENT"; id: string };
    name?: string;
    spec: GateNodeSpec;
  }): Promise<{ gateId: string; rootNodeId: string }>;
  createSession(args: {
    workspaceId: string;
    gateId: string;
    memberId?: string;
  }): Promise<{ sessionId: string; token: string }>;
  evaluateGate(args: EvaluateGateArgs): Promise<GateDecision>;
};

export function createGateEngine(deps: {
  db: PrismaClient;
  registry: ConditionRegistry;
}): GateEngine {
  const { db, registry } = deps;

  async function createGate(args: {
    workspaceId: string;
    resource: { type: "EVENT"; id: string };
    name?: string;
    spec: GateNodeSpec;
  }): Promise<{ gateId: string; rootNodeId: string }> {
    const result = validateGateSpec(args.spec, registry);
    if (!result.valid) throw new GateAuthoringError(result.errors);

    return db.$transaction(async (tx) => {
      const gate = await tx.gate.create({
        data: {
          workspaceId: args.workspaceId,
          resourceType: args.resource.type,
          resourceId: args.resource.id,
          name: args.name ?? null,
        },
      });

      async function createNode(
        spec: GateNodeSpec,
        parentId: string | null,
        position: number
      ): Promise<string> {
        const node = await tx.gateNode.create({
          data: {
            workspaceId: args.workspaceId,
            gateId: gate.id,
            parentId,
            position,
            kind: spec.kind,
            required: spec.required ?? false,
            weight: spec.weight ?? null,
            rule: spec.kind === "GROUP" ? spec.rule : null,
            requiredCount: spec.kind === "GROUP" ? spec.requiredCount ?? null : null,
            weightThreshold:
              spec.kind === "GROUP" ? spec.weightThreshold ?? null : null,
            conditionType: spec.kind === "CONDITION" ? spec.conditionType : null,
            config:
              spec.kind === "CONDITION" && spec.config !== undefined
                ? (spec.config as object)
                : undefined,
          },
        });
        if (spec.kind === "GROUP") {
          for (let i = 0; i < spec.children.length; i++) {
            await createNode(spec.children[i], node.id, i);
          }
        }
        return node.id;
      }

      const rootNodeId = await createNode(args.spec, null, 0);
      return { gateId: gate.id, rootNodeId };
    });
  }

  async function createSession(args: {
    workspaceId: string;
    gateId: string;
    memberId?: string;
  }): Promise<{ sessionId: string; token: string }> {
    const session = await db.gateSession.create({
      data: {
        workspaceId: args.workspaceId,
        gateId: args.gateId,
        memberId: args.memberId ?? null,
      },
    });
    return { sessionId: session.id, token: session.token };
  }

  /** Run one condition verification and persist the proof. Returns the
   *  outcome, or an error marker (no proof written) - fail-closed either way. */
  async function runVerification(args: {
    node: GateNode;
    member: Member;
    workspaceId: string;
    resource: { type: GateResourceType; id: string };
    submission: unknown;
    now: Date;
  }): Promise<
    | { kind: "verified"; outcome: VerifyOutcome; proofId: string }
    | { kind: "error"; code: "VERIFIER_ERROR" | "INVALID_CONFIG" | "UNREGISTERED_CONDITION" }
  > {
    const { node, member, workspaceId, submission, now } = args;
    if (!node.conditionType) return { kind: "error", code: "INVALID_CONFIG" };
    const def = registry.get(node.conditionType);
    if (!def) {
      console.error("[gate-engine] verification against unregistered condition type", {
        conditionType: node.conditionType,
        nodeId: node.id,
        workspaceId,
      });
      return { kind: "error", code: "UNREGISTERED_CONDITION" };
    }
    const parsedConfig = def.configSchema.safeParse(node.config ?? {});
    if (!parsedConfig.success) {
      console.error("[gate-engine] node config failed its condition schema", {
        conditionType: node.conditionType,
        nodeId: node.id,
        workspaceId,
        issues: parsedConfig.error.issues.map((i) => i.message),
      });
      return { kind: "error", code: "INVALID_CONFIG" };
    }

    let outcome: VerifyOutcome;
    try {
      outcome = await def.verify({
        config: parsedConfig.data,
        submission,
        member,
        workspaceId,
        resource: args.resource,
      });
    } catch (err) {
      console.error("[gate-engine] verifier threw - evaluating fail-closed", {
        conditionType: node.conditionType,
        nodeId: node.id,
        memberId: member.id,
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { kind: "error", code: "VERIFIER_ERROR" };
    }

    const proof = await writeNodeProof(db, {
      workspaceId,
      nodeId: node.id,
      memberId: member.id,
      conditionType: node.conditionType,
      status: outcome.outcome,
      tier: def.verificationTier, // stamped from the contract - honesty by construction
      mechanism: def.proofMechanism,
      payload: outcome.payload ?? null,
      sourceProofId: null, // a fresh verification clears carry lineage
      verifiedAt: now,
      expiresAt: computeExpiry(def.carryForward, now),
    });

    if (outcome.outcome === "SATISFIED" && def.feedsGrowthGraph) {
      const edge = def.feedsGrowthGraph(proof, { workspaceId, memberId: member.id });
      if (edge) {
        await recordGrowthEdge(db, {
          workspaceId,
          edge,
          resourceType: args.resource.type,
          resourceId: args.resource.id,
          proofId: proof.id,
        });
      }
    }

    return { kind: "verified", outcome, proofId: proof.id };
  }

  async function evaluateGate(args: EvaluateGateArgs): Promise<GateDecision> {
    const now = args.now ?? new Date();
    const verifierErrors: GateDecision["verifierErrors"] = [];

    const gate = await db.gate.findFirst({
      where: { id: args.gateId, workspaceId: args.workspaceId },
    });
    if (!gate) {
      return { open: false, reason: "GATE_NOT_FOUND", evaluation: null, verifierErrors };
    }
    const member = await db.member.findFirst({
      where: { id: args.memberId, workspaceId: args.workspaceId },
    });
    if (!member) {
      return { open: false, reason: "MEMBER_NOT_FOUND", evaluation: null, verifierErrors };
    }

    const rows = await db.gateNode.findMany({
      where: { gateId: gate.id, workspaceId: args.workspaceId },
      orderBy: { position: "asc" },
    });
    const roots = rows.filter((r) => r.parentId === null);
    if (roots.length === 0) {
      return { open: false, reason: "NO_ROOT", evaluation: null, verifierErrors };
    }
    if (roots.length > 1) {
      return { open: false, reason: "MULTIPLE_ROOTS", evaluation: null, verifierErrors };
    }
    const tree = buildTree(rows, roots[0].id);
    const conditionRows = rows.filter((r) => r.kind === "CONDITION");
    const resource = { type: gate.resourceType, id: gate.resourceId };

    // 1. Carry-forward: pre-satisfy from prior proofs (ALWAYS / MONTHS only).
    await carryForwardForNodes(db, {
      workspaceId: args.workspaceId,
      memberId: member.id,
      conditionNodes: conditionRows.map(toTreeNode),
      registry,
      now,
    });

    // 2. Member-initiated submissions.
    const liveOverlay = new Map<string, ProofSnapshot | null>();
    for (const [nodeId, submission] of Object.entries(args.submissions ?? {})) {
      const node = conditionRows.find((r) => r.id === nodeId);
      if (!node) {
        console.error("[gate-engine] submission for unknown or non-condition node", {
          nodeId,
          gateId: gate.id,
          workspaceId: args.workspaceId,
        });
        continue;
      }
      const def = node.conditionType ? registry.get(node.conditionType) : null;
      const policy = def?.carryForward;
      if (policy && policy.kind !== "LIVE") {
        const current = await db.gateProof.findFirst({
          where: { nodeId: node.id, memberId: member.id },
          select: { status: true, expiresAt: true },
        });
        if (current && isProofLive(current, now)) continue; // established truth stands
      }
      const run = await runVerification({ node, member, workspaceId: args.workspaceId, resource, submission, now });
      if (run.kind === "error") verifierErrors.push({ nodeId: node.id, code: run.code });
    }

    // 3. Passive verifications. LIVE types re-run every evaluation and the
    //    evaluation trusts only THIS run's outcome.
    for (const node of conditionRows) {
      if (!node.conditionType) continue;
      const def = registry.get(node.conditionType);
      if (!def || !def.isPassive) continue;

      if (def.carryForward.kind === "LIVE") {
        const run = await runVerification({ node, member, workspaceId: args.workspaceId, resource, submission: undefined, now });
        if (run.kind === "error") {
          verifierErrors.push({ nodeId: node.id, code: run.code });
          liveOverlay.set(node.id, null); // stale rows must not grant
        } else {
          liveOverlay.set(node.id, {
            status: run.outcome.outcome,
            expiresAt: null,
          });
        }
        continue;
      }

      const current = await db.gateProof.findFirst({
        where: { nodeId: node.id, memberId: member.id },
        select: { status: true, expiresAt: true },
      });
      if (current && isProofLive(current, now)) continue;
      if (current && !isProofLive(current, now) && current.status !== "SATISFIED") {
        // A standing REJECTED / PENDING_REVIEW row is respected until a new
        // submission or operator action changes it - passive re-runs must not
        // silently flip a human-relevant state.
        continue;
      }
      const run = await runVerification({ node, member, workspaceId: args.workspaceId, resource, submission: undefined, now });
      if (run.kind === "error") verifierErrors.push({ nodeId: node.id, code: run.code });
    }

    // 4. Build the proof index (fresh rows + LIVE overlay), evaluate pure.
    const index = await loadProofIndex(db, {
      memberId: member.id,
      nodeIds: conditionRows.map((r) => r.id),
    });
    for (const [nodeId, snapshot] of liveOverlay) {
      if (snapshot === null) index.delete(nodeId);
      else index.set(nodeId, snapshot);
    }
    const evaluation = evaluateTree(tree, index, {
      now,
      registeredTypes: registry.typeSet(),
    });

    const decision: GateDecision = {
      open: evaluation.open,
      reason: "EVALUATED",
      evaluation,
      verifierErrors,
    };

    // 5. Snapshot onto the session (workspace-scoped write).
    if (args.sessionId) {
      await db.gateSession.updateMany({
        where: { id: args.sessionId, workspaceId: args.workspaceId, gateId: gate.id },
        data: {
          memberId: member.id,
          status: decision.open ? "SATISFIED" : "ACTIVE",
          lastDecision: {
            open: decision.open,
            reason: decision.reason,
            structuralViolation: evaluation.structuralViolation,
            evaluatedAt: now.toISOString(),
            nodes: evaluation.nodes,
          },
        },
      });
    }

    return decision;
  }

  return { createGate, createSession, evaluateGate };
}

function toTreeNode(row: GateNode): GateTreeNode {
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

function buildTree(rows: GateNode[], rootId: string): GateTreeNode | null {
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
