/** AI event composition (Event Builder Rebuild, Phase E - Decision 6).
 *
 *  Plain English in, reviewable DRAFT out. The model produces a typed
 *  CompositionPlan; the plan is executed EXCLUSIVELY through the builder
 *  action layer (lib/builder/actions.ts) - the AI has zero capabilities the
 *  UI lacks, zero direct DB writes, and structurally cannot publish (the
 *  publish action demands a confirm flag this module never passes) or touch
 *  Stripe (no money surface exists in the action layer).
 *
 *  Ambiguity resolves to smart defaults, each one FLAGGED in the returned
 *  summary the operator reviews in the WYSIWYG preview. Humans approve; AI
 *  operates. Model: JUDGMENT_MODEL per the locked two-tier policy.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { JUDGMENT_MODEL } from "@/lib/ai/runtime-models";
import type { GateNodeSpec } from "@/lib/gate-engine/types";
import {
  createCompCode,
  createEventDraft,
  setGateSpec,
  setServiceFee,
  updateEventDetails,
} from "./actions";

// ── The plan the model must produce ─────────────────────────────────────────

const requirementSchema = z.object({
  kind: z.enum(["pay", "apply", "member", "referred", "attended", "questions"]),
  /** pay only - cents. */
  priceCents: z.number().int().min(50).max(1_000_000).optional(),
  /** pay only - optional display label (Early Bird, GA, Door). */
  label: z.string().max(80).optional(),
  /** questions only. */
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(300),
        required: z.boolean().default(false),
      }),
    )
    .max(24)
    .optional(),
});

const planSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  /** ISO datetime; null lets the smart default (next Saturday 8pm) stand. */
  startAt: z.string().nullable(),
  location: z.string().max(300).nullable(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
  /** Requirements every guest must meet (AND). */
  requiredAll: z.array(requirementSchema).max(6),
  /** Alternatives - any ONE opens the door (OR group). Empty = none. */
  anyOneOf: z.array(requirementSchema).max(6),
  serviceFeeMode: z.enum(["absorb", "pass_stripe_only"]).default("absorb"),
  compCode: z.string().regex(/^[A-Za-z0-9-]{3,40}$/).nullable(),
  /** One line per assumption the operator should eyeball. */
  assumptions: z.array(z.string().max(200)).max(12),
});

export type CompositionPlan = z.infer<typeof planSchema>;

/** Injectable planner port so tests never touch the network. */
export type Planner = (prompt: string) => Promise<CompositionPlan>;

const SYSTEM = `You compose event drafts for No Bad Company, a premium member club.
Turn the operator's sentence into the plan schema. Rules:
- "apply or pay" / "members free" style alternatives belong in anyOneOf; unconditional requirements in requiredAll.
- "members free" means kind "member" as an alternative to paying.
- Prices arrive in dollars; output cents.
- Never invent requirements, codes, or capacities the operator did not imply. Leave nullable fields null when unsaid.
- Every assumption you make (date, template, fee handling) goes in assumptions, one short line each, plain language.
- Copy law: "Access" never "RSVP"; "No Bad Company" never "NBC"; spaced hyphens, never em dashes.`;

async function defaultPlanner(prompt: string): Promise<CompositionPlan> {
  const result = await generateObject({
    model: anthropic(JUDGMENT_MODEL),
    system: SYSTEM,
    prompt,
    schema: planSchema,
  });
  return result.object;
}

function requirementToSpec(req: z.infer<typeof requirementSchema>): GateNodeSpec | null {
  switch (req.kind) {
    case "pay":
      return {
        kind: "CONDITION",
        conditionType: "PAY",
        config: {
          priceCents: req.priceCents ?? 2500,
          ...(req.label ? { label: req.label } : {}),
        },
      };
    case "apply":
      return { kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} };
    case "member":
      return { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} };
    case "referred":
      return { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} };
    case "attended":
      return { kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} };
    case "questions":
      return req.questions && req.questions.length > 0
        ? {
            kind: "CONDITION",
            conditionType: "COLLECT_INFO",
            config: {
              questions: req.questions.map((q) => ({
                id: q.id,
                label: q.label,
                type: "text",
                required: q.required,
              })),
            },
          }
        : null;
    default:
      return null;
  }
}

export function planToGateSpec(plan: CompositionPlan): GateNodeSpec | null {
  const children: GateNodeSpec[] = plan.requiredAll
    .map(requirementToSpec)
    .filter((s): s is GateNodeSpec => s !== null);
  const alternatives = plan.anyOneOf
    .map(requirementToSpec)
    .filter((s): s is GateNodeSpec => s !== null);
  if (alternatives.length === 1) children.push(alternatives[0]);
  if (alternatives.length > 1) {
    children.push({
      kind: "GROUP",
      rule: "ANY_N",
      requiredCount: 1,
      children: alternatives,
    });
  }
  if (children.length === 0) return null; // Open - anyone can get in
  return { kind: "GROUP", rule: "ALL", children };
}

export type ComposeResult =
  | { ok: true; eventId: string; summary: string[] }
  | { ok: false; error: string };

/** Compose a DRAFT from a prompt. Everything flows through the action layer;
 *  the result lands the operator in the builder preview. NEVER publishes. */
export async function composeEventFromPrompt(
  prompt: string,
  ports?: { planner?: Planner },
): Promise<ComposeResult> {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, error: "Describe the event in a sentence or two." };
  }

  let plan: CompositionPlan;
  try {
    plan = planSchema.parse(await (ports?.planner ?? defaultPlanner)(trimmed));
  } catch (err) {
    console.error("[compose] planning failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Could not compose that - try rephrasing." };
  }

  // Execute through the SAME actions the UI uses. Each step's failure aborts
  // with the action's own guest-safe error.
  const created = await createEventDraft({
    title: plan.title,
    ...(plan.startAt ? { startAt: plan.startAt } : {}),
    ...(plan.location ? { location: plan.location } : {}),
  });
  if (!created.ok) return created;

  const details = await updateEventDetails(created.eventId, {
    ...(plan.description ? { description: plan.description } : {}),
    ...(plan.capacity ? { capacity: plan.capacity } : {}),
  });
  if (!details.ok) return details;

  const spec = planToGateSpec(plan);
  const gate = await setGateSpec(created.eventId, spec);
  if (!gate.ok) return gate;

  if (plan.serviceFeeMode !== "absorb") {
    const fee = await setServiceFee(created.eventId, {
      mode: plan.serviceFeeMode,
      percentBps: null,
      flatCents: null,
    });
    if (!fee.ok) return fee;
  }

  if (plan.compCode) {
    const comp = await createCompCode(created.eventId, { code: plan.compCode });
    if (!comp.ok) return comp;
  }

  const summary = [
    `Draft "${plan.title}" is ready - review it in the preview.`,
    spec === null
      ? "Access: Open - anyone can get in."
      : "Access composed from your sentence - check the chips.",
    ...(plan.serviceFeeMode === "pass_stripe_only"
      ? ["Guests cover the card fee - toggle it off under Service fee if unwanted."]
      : []),
    ...(plan.compCode ? [`Comp code ${plan.compCode.toUpperCase()} created.`] : []),
    ...plan.assumptions,
    "Nothing is published and no payment is live until you flip the switch.",
  ];
  return { ok: true, eventId: created.eventId, summary };
}
