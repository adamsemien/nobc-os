"use server";

/** The client-callable seam for AI composition (Phase E; confirm-before-
 *  create restructure). Two actions, one law: NOTHING is persisted until the
 *  operator explicitly confirms.
 *
 *  - proposeEventAction: extraction only. Runs the model, returns the typed
 *    plan + core-field gap questions + the plain-English access readout.
 *    Zero writes - a bad extraction is a discardable proposal, never a row.
 *  - confirmComposeAction: the operator's explicit confirm. Re-validates the
 *    plan server-side, then executes EXCLUSIVELY through the STAFF-gated
 *    builder action layer (which also re-checks auth on every write).
 *
 *  The one-shot composeEventAction seam is gone - no client path can create
 *  without the confirm step. Both actions are STAFF-gated up front too, so
 *  a READ_ONLY operator cannot spend model tokens or probe the extractor.
 */
import { OperatorRole } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { getMemberWorkspaceId } from "@/lib/auth";
import { getEffectiveRole, roleAtLeast } from "@/lib/operator-role";
import {
  executeComposition,
  planSchema,
  normalizeIso,
  proposeComposition,
  type Clarification,
  type ComposeResult,
  type ProposeResult,
} from "./compose";

async function staffGate(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Sign in required." };
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return { ok: false, error: "No workspace." };
  const role = await getEffectiveRole(userId, workspaceId);
  if (!role || !roleAtLeast(role, OperatorRole.STAFF)) {
    return { ok: false, error: "You do not have access to the builder." };
  }
  return { ok: true };
}

export async function proposeEventAction(
  prompt: string,
  clarifications?: Clarification[],
): Promise<ProposeResult> {
  const gate = await staffGate();
  if (!gate.ok) return gate;
  return proposeComposition(prompt, {
    clarifications: (clarifications ?? [])
      .filter((c) => c && typeof c.question === "string" && typeof c.answer === "string")
      .map((c) => ({
        question: c.question.slice(0, 300),
        answer: c.answer.slice(0, 500),
      })),
  });
}

export async function confirmComposeAction(input: {
  plan: unknown;
  endAt?: string | null;
}): Promise<ComposeResult> {
  const gate = await staffGate();
  if (!gate.ok) return gate;

  const parsed = planSchema.safeParse(input?.plan);
  if (!parsed.success) {
    return { ok: false, error: "That plan could not be read - compose it again." };
  }
  const plan = { ...parsed.data, startAt: normalizeIso(parsed.data.startAt) };
  return executeComposition(plan, { endAt: normalizeIso(input?.endAt ?? null) });
}
