/** AI event composition (Event Builder Rebuild, Phase E - Decision 6;
 *  confirm-before-create restructure, ai-event-creation build).
 *
 *  Plain English in, a PROPOSED plan out - nothing is persisted until the
 *  operator explicitly confirms. The flow is now three separable steps:
 *
 *    1. proposeComposition(prompt)  - extraction only, ZERO writes. Returns
 *       the typed plan, the plain-English access readout, and the list of
 *       missing CORE fields (start, implied end, location, ambiguous access)
 *       the operator should be asked about before anything is created.
 *    2. (the operator answers gap questions; answers feed back in as
 *       clarifications and the plan is re-extracted - never client-patched)
 *    3. executeComposition(plan)    - runs ONLY after operator confirm,
 *       EXCLUSIVELY through the builder action layer (lib/builder/actions.ts).
 *       The AI has zero capabilities the UI lacks, zero direct DB writes, and
 *       structurally cannot publish (the publish action demands a confirm
 *       flag this module never passes) or touch Stripe (no money surface
 *       exists in the action layer).
 *
 *  The extraction schema (planSchema) and the gate compilation
 *  (planToGateSpec) are the shipped Phase E logic, reused as-is.
 *  Non-core fields (capacity, description, hero, service fee) never prompt -
 *  they default silently, flagged in assumptions, editable in the builder.
 *  Model: JUDGMENT_MODEL per the locked two-tier policy.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { JUDGMENT_MODEL } from "@/lib/ai/runtime-models";
import {
  isOpenSpec,
  openGateSpec,
  type GateNodeSpec,
} from "@/lib/gate-engine/types";
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

export const planSchema = z.object({
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

export function planToGateSpec(plan: CompositionPlan): GateNodeSpec {
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
  // Loose Ends L1: "open" is a real gate now (the canonical OPEN spec), never
  // a null that would delete the draft's default gate.
  if (children.length === 0) return openGateSpec();
  return { kind: "GROUP", rule: "ALL", children };
}

// ── Date context + ISO normalization ────────────────────────────────────────
// The model cannot resolve "next Sunday" without knowing today. The club's
// home timezone is America/Chicago; the operator sees the resolved instant on
// the confirm screen (in their browser's timezone) before anything exists,
// so a misresolved date is caught there, never silently created.

function promptContext(now: Date): string {
  const stamp = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
  return `Context: right now it is ${stamp}. Resolve relative dates ("next Sunday", "this Friday") against that. Event times are America/Chicago local unless the operator says otherwise; output every datetime as ISO 8601 with an explicit UTC offset or Z.`;
}

function buildPrompt(
  prompt: string,
  now: Date,
  clarifications?: Clarification[],
): string {
  const parts = [prompt, promptContext(now)];
  if (clarifications && clarifications.length > 0) {
    parts.push(
      "Operator clarifications - authoritative, they override anything ambiguous above:\n" +
        clarifications
          .map((c) => `- Q: ${c.question}\n  A: ${c.answer}`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

/** Any parseable datetime string -> ISO Z-form (what the action layer's
 *  zod .datetime() accepts). Unparseable -> null, which surfaces as a gap
 *  question instead of a post-confirm action-layer failure. */
export function normalizeIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Gap probe (sidecar - planSchema itself is frozen) ───────────────────────
// Two things the plan cannot carry: whether the operator implied a definite
// END time (planSchema has no endAt), and whether the ACCESS wording was too
// ambiguous to trust (pay vs apply vs both). Both are judgment calls about
// the operator's language, so this rides JUDGMENT_MODEL alongside extraction.

const gapProbeSchema = z.object({
  /** True only when the words imply a definite end ("2-6pm", "ends at
   *  midnight") - "till late" is open-ended, not an implied end. */
  endImplied: z.boolean(),
  /** ISO datetime when the end is stated and resolvable; else null. */
  endAt: z.string().nullable(),
  /** True when it is unclear whether guests pay, apply, or have both ways
   *  in. A clear "$25 or apply" is NOT ambiguous. */
  accessAmbiguous: z.boolean(),
});

export type GapProbe = z.infer<typeof gapProbeSchema>;
export type GapProber = (prompt: string) => Promise<GapProbe>;

const GAP_SYSTEM = `You review one sentence describing a club event and answer three narrow questions about it. Do not infer beyond the words.
- endImplied: true only if the operator's words imply the event has a definite end time. "Pool party 2-6pm" implies one; "dinner at 8" or "till late" does not.
- endAt: the end as ISO 8601 (explicit UTC offset or Z) if stated and resolvable, else null. Times are America/Chicago local unless stated otherwise.
- accessAmbiguous: true only if you cannot tell how guests get in - paying, applying, or either. "$25 or apply" is clear (both, either one works). "maybe ticketed" is ambiguous. A sentence that never mentions money or applying is NOT ambiguous - it is simply open.`;

async function defaultGapProber(prompt: string): Promise<GapProbe> {
  const result = await generateObject({
    model: anthropic(JUDGMENT_MODEL),
    system: GAP_SYSTEM,
    prompt,
    schema: gapProbeSchema,
  });
  return result.object;
}

// ── Core gaps (locked decision 1) ───────────────────────────────────────────
// Core = start, end (only when implied), location, access (only when
// ambiguous). Capacity, description, hero, service fee NEVER prompt.

export type CoreField = "startAt" | "endAt" | "location" | "access";
export type CoreGap = { field: CoreField; question: string };
export type Clarification = { question: string; answer: string };

const GAP_QUESTIONS: Record<CoreField, string> = {
  startAt: "When does it start? A date and a time - for example, Sunday July 19, 7pm.",
  endAt: "When does it end? Your description implies a wrap time.",
  location: "Where is it happening?",
  access: "How do guests get in - pay, apply to attend, or either one?",
};

export function findCoreGaps(
  plan: CompositionPlan,
  probe: GapProbe | null,
): CoreGap[] {
  const gaps: CoreGap[] = [];
  if (!plan.startAt) gaps.push({ field: "startAt", question: GAP_QUESTIONS.startAt });
  if (probe?.endImplied && !probe.endAt)
    gaps.push({ field: "endAt", question: GAP_QUESTIONS.endAt });
  if (!plan.location) gaps.push({ field: "location", question: GAP_QUESTIONS.location });
  if (probe?.accessAmbiguous)
    gaps.push({ field: "access", question: GAP_QUESTIONS.access });
  return gaps;
}

// ── Plain-English access readout (the confirm screen's safety surface) ──────
// Copy law: "Access" never "RSVP"; spaced hyphens, never em dashes; no raw
// enum values or GateNodeSpec JSON ever reaches the operator here.

function money(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}

function requirementPhrase(req: z.infer<typeof requirementSchema>): string {
  switch (req.kind) {
    case "pay":
      return `pay ${money(req.priceCents ?? 2500)}${req.label ? ` (${req.label})` : ""}`;
    case "apply":
      return "apply for consideration";
    case "member":
      return "hold a membership";
    case "referred":
      return "be referred by a member";
    case "attended":
      return "have attended a prior event";
    case "questions":
      return "answer a few questions";
    default:
      return "";
  }
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

/** The plan's access model in plain English, one line per clause. Mirrors
 *  planToGateSpec exactly: a single alternative reads as required (the
 *  compiler folds it into the AND group), 2+ alternatives read as one
 *  any-one-way-in line. */
export function accessReadout(plan: CompositionPlan): string[] {
  const required = plan.requiredAll.map(requirementPhrase).filter(Boolean);
  const alternatives = plan.anyOneOf.map(requirementPhrase).filter(Boolean);
  if (alternatives.length === 1) {
    required.push(alternatives[0]);
    alternatives.length = 0;
  }
  const lines: string[] = [];
  if (required.length > 0) {
    lines.push(sentence(`to attend, guests must ${required.join(", and ")}`));
  }
  if (alternatives.length > 0) {
    lines.push(sentence(`any one way in: ${alternatives.join(", or ")}`));
  }
  if (lines.length === 0) lines.push("Open - anyone can get in.");
  return lines;
}

// ── Step 1: propose (extraction only - ZERO writes) ─────────────────────────

export type CompositionProposal = {
  plan: CompositionPlan;
  /** From the gap probe (planSchema carries no endAt); ISO Z-form. */
  endAt: string | null;
  gaps: CoreGap[];
  readout: string[];
};

export type ProposeResult =
  | { ok: true; proposal: CompositionProposal }
  | { ok: false; error: string };

/** Extract a proposed plan from the prompt (plus any operator clarifications
 *  from a prior question round). Performs NO persistence of any kind - no
 *  event row, no gate, no draft exists until executeComposition runs after
 *  the operator's explicit confirm. */
export async function proposeComposition(
  prompt: string,
  opts?: {
    clarifications?: Clarification[];
    planner?: Planner;
    gapProber?: GapProber;
    now?: Date;
  },
): Promise<ProposeResult> {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, error: "Describe the event in a sentence or two." };
  }
  const full = buildPrompt(trimmed, opts?.now ?? new Date(), opts?.clarifications);

  // Fire both model calls together - one shared input, zero data dependency;
  // propose latency is the slower of the two, not the sum. allSettled (never
  // Promise.all) so the two failure modes stay independent: a planner failure
  // is fatal, a probe failure only degrades, and neither can mask the other.
  const [planSettled, probeSettled] = await Promise.allSettled([
    (opts?.planner ?? defaultPlanner)(full),
    (opts?.gapProber ?? defaultGapProber)(full),
  ]);

  let plan: CompositionPlan;
  try {
    if (planSettled.status === "rejected") throw planSettled.reason;
    plan = planSchema.parse(planSettled.value);
  } catch (err) {
    console.error("[compose] planning failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Could not compose that - try rephrasing." };
  }

  // The probe degrades gracefully: if it fails, end/access gap detection is
  // skipped (logged), and the confirm screen - which always renders the
  // access model in plain English - remains the hard safety gate.
  let probe: GapProbe | null = null;
  try {
    if (probeSettled.status === "rejected") throw probeSettled.reason;
    probe = gapProbeSchema.parse(probeSettled.value);
  } catch (err) {
    console.error("[compose] gap probe failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Normalize datetimes to the Z-form the action layer's zod accepts; an
  // unparseable start becomes a gap question instead of a post-confirm error.
  plan = { ...plan, startAt: normalizeIso(plan.startAt) };
  const endAt = probe?.endImplied ? normalizeIso(probe.endAt) : null;

  return {
    ok: true,
    proposal: {
      plan,
      endAt,
      gaps: findCoreGaps(plan, probe),
      readout: accessReadout(plan),
    },
  };
}

// ── Step 3: execute (runs ONLY after operator confirm) ──────────────────────

export type ComposeResult =
  | { ok: true; eventId: string; summary: string[] }
  | { ok: false; error: string };

/** Create the confirmed plan through the SAME actions the UI uses. Each
 *  step's failure aborts with the action's own guest-safe error. NEVER
 *  publishes - the draft lands in the builder preview. */
export async function executeComposition(
  plan: CompositionPlan,
  extras?: { endAt?: string | null },
): Promise<ComposeResult> {
  const created = await createEventDraft({
    title: plan.title,
    ...(plan.startAt ? { startAt: plan.startAt } : {}),
    ...(plan.location ? { location: plan.location } : {}),
  });
  if (!created.ok) return created;

  const details = await updateEventDetails(created.eventId, {
    ...(plan.description ? { description: plan.description } : {}),
    ...(plan.capacity ? { capacity: plan.capacity } : {}),
    ...(extras?.endAt ? { endAt: extras.endAt } : {}),
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
    isOpenSpec(spec)
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

/** One-shot compose - the programmatic/test seam (plan straight to rows, no
 *  question round, no gap probe). Operator-facing surfaces must NOT call
 *  this: they go through proposeComposition -> operator confirm ->
 *  executeComposition so nothing exists before the confirm. */
export async function composeEventFromPrompt(
  prompt: string,
  ports?: { planner?: Planner },
): Promise<ComposeResult> {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, error: "Describe the event in a sentence or two." };
  }
  const full = buildPrompt(trimmed, new Date());

  let plan: CompositionPlan;
  try {
    plan = planSchema.parse(await (ports?.planner ?? defaultPlanner)(full));
  } catch (err) {
    console.error("[compose] planning failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Could not compose that - try rephrasing." };
  }
  plan = { ...plan, startAt: normalizeIso(plan.startAt) };

  return executeComposition(plan);
}
