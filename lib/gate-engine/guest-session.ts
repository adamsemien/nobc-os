/** Token-addressed guest traversal (Stage 17, M2 guest render).
 *
 *  A GateSession token is the guest's capability: it names one gate traversal
 *  in one workspace. Everything here is fail-closed - an unknown, expired, or
 *  cross-workspace token resolves to null and the surface renders
 *  unavailable. Anonymous guests identify with name + email, which mints (or
 *  finds) a GUEST Member through the FROZEN helper
 *  lib/event-access-submit.ts#findOrCreateGuestMember - called, never edited.
 *  Once a session is identified it is immutable: a second identify with a
 *  different email keeps the original member (capability tokens must not
 *  allow member swapping mid-traversal).
 */
import type { Gate, GateSession, PrismaClient } from "@prisma/client";
import { payNodeAvailability } from "./conditions/pay";
import type { GateEngine } from "./orchestrate";
import type { ConditionRegistry } from "./registry";
import { loadProofIndex } from "./proofs";
import {
  projectGuestView,
  type GuestGateView,
  type PayUnavailableReason,
} from "./guest-view";
import { CONDITION_PAY } from "./types";
import type { GateTreeNode, ProofIndex } from "./types";

export type GuestGateContext = {
  session: GateSession;
  gate: Gate;
};

export async function loadGuestGateContext(
  db: PrismaClient,
  token: string,
  now: Date = new Date()
): Promise<GuestGateContext | null> {
  if (!token || token.length < 8) return null;
  const session = await db.gateSession.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt !== null && session.expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  const gate = await db.gate.findFirst({
    where: { id: session.gateId, workspaceId: session.workspaceId },
  });
  if (!gate) return null;
  return { session, gate };
}

/** Attach a member to an anonymous session via the frozen guest-member
 *  helper. Idempotent; an already-identified session is returned unchanged. */
export async function identifyGuestSession(
  db: PrismaClient,
  args: { token: string; email: string; name: string }
): Promise<GuestGateContext | null> {
  const context = await loadGuestGateContext(db, args.token);
  if (!context) return null;
  if (context.session.memberId) return context;

  const { findOrCreateGuestMember } = await import("@/lib/event-access-submit");
  const guest = await findOrCreateGuestMember(
    context.session.workspaceId,
    args.email,
    args.name
  );
  const session = await db.gateSession.update({
    where: { id: context.session.id },
    data: { memberId: guest.id },
  });
  return { session, gate: context.gate };
}

/** Load tree + proofs and project the guest view for a session. Evaluates
 *  through the engine when the session is identified; renders prompts-only
 *  when it is still anonymous. */
export async function guestViewForSession(
  deps: { db: PrismaClient; engine: GateEngine; registry: ConditionRegistry },
  context: GuestGateContext,
  options?: { submissions?: Record<string, unknown> }
): Promise<GuestGateView> {
  const { db, engine, registry } = deps;
  const { session, gate } = context;

  const rows = await db.gateNode.findMany({
    where: { gateId: gate.id, workspaceId: gate.workspaceId },
    orderBy: { position: "asc" },
  });
  const roots = rows.filter((r) => r.parentId === null);
  if (roots.length !== 1) return { available: false };
  const byId = new Map<string, GateTreeNode>();
  for (const row of rows) {
    byId.set(row.id, {
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
    });
  }
  for (const row of rows) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    const child = byId.get(row.id);
    if (parent && child) parent.children.push(child);
  }
  const tree = byId.get(roots[0].id) ?? null;

  // Phase F (ADD 4): compute the offer-layer availability for PAY nodes that
  // declare a window or a quantity cap. Sold counts are live SATISFIED
  // proofs on the node (paid + comp alike). Constraint-free nodes skip the
  // count entirely.
  const payAvailability = new Map<string, PayUnavailableReason>();
  const now = new Date();
  for (const row of rows) {
    if (row.kind !== "CONDITION" || row.conditionType !== CONDITION_PAY) continue;
    const def = registry.get(CONDITION_PAY);
    const parsed = def?.configSchema.safeParse(row.config ?? {});
    if (!parsed?.success) continue;
    const config = parsed.data as {
      availableFrom?: string;
      availableUntil?: string;
      maxQuantity?: number;
    };
    if (!config.availableFrom && !config.availableUntil && config.maxQuantity === undefined) {
      continue;
    }
    const soldCount =
      config.maxQuantity !== undefined
        ? await db.gateProof.count({
            where: {
              nodeId: row.id,
              status: "SATISFIED",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          })
        : 0;
    const availability = payNodeAvailability(config, { now, soldCount });
    if (!availability.available) payAvailability.set(row.id, availability.reason);
  }

  if (!session.memberId) {
    return projectGuestView({
      tree,
      evaluation: null,
      proofs: new Map(),
      registry,
      needsIdentity: true,
      payAvailability,
    });
  }

  const decision = await engine.evaluateGate({
    workspaceId: session.workspaceId,
    gateId: gate.id,
    memberId: session.memberId,
    sessionId: session.id,
    submissions: options?.submissions,
  });
  if (decision.reason !== "EVALUATED" || !decision.evaluation) {
    return { available: false };
  }

  const proofs: ProofIndex = await loadProofIndex(db, {
    memberId: session.memberId,
    nodeIds: rows.filter((r) => r.kind === "CONDITION").map((r) => r.id),
  });

  return projectGuestView({
    tree,
    evaluation: decision.evaluation,
    proofs,
    registry,
    needsIdentity: false,
    payAvailability,
  });
}
