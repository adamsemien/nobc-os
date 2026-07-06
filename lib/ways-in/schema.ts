/** Ways-In authored model (Stage 17, Phase A - spec §1/§2.0).
 *
 *  The Zod shape of the persisted EventAccessModel.waysIn document - the
 *  source of truth the compiler reads. All seven dials are STORED
 *  (forward-compatible with Phases B-C); only Phase-A values compile:
 *
 *  - requirements: pay / apply / nothing / referred compile now. `screening`
 *    is reserved (deferred to Phase C - COLLECT_INFO collects, it does not
 *    screen; making it screen changes a shipped verifier's semantics).
 *    prove-membership / verify-age / named-list / invited are Phase-C engine
 *    additions and are NOT accepted by this schema yet.
 *  - constraints: window + cap ride the `pay` requirement's config only
 *    (the existing PAY offer-layer fields). No generic node modifiers exist.
 *  - approval: 'instant' only (manual = Phase C, net-new engine state).
 *  - visibility: 'public' only (private-link = Phase C, net-new).
 *
 *  Authoring rule: `priceCents` >= 100 present iff a `pay` requirement
 *  exists - "free" is expressed by `nothing`/other requirements, never
 *  pay-at-zero.
 */
import { z } from "zod";

export const WAY_IN_REQUIREMENT_TYPES = [
  "pay",
  "apply",
  "nothing",
  "referred",
  "screening", // reserved - compiler rejects until Phase C
] as const;
export type WayInRequirementType = (typeof WAY_IN_REQUIREMENT_TYPES)[number];

/** Requirement types the Phase-A compiler can express on the gate tree. */
export const PHASE_A_COMPILABLE: ReadonlySet<WayInRequirementType> = new Set([
  "pay",
  "apply",
  "nothing",
  "referred",
]);

const payRequirementSchema = z.object({
  type: z.literal("pay"),
  // Window + cap (spec §2.2): PAY-config constraints, the only ones that
  // exist in the engine today. ISO datetimes, mirrored into PAY config.
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  maxQuantity: z.number().int().min(1).optional(),
});

const simpleRequirementSchema = z.object({
  type: z.enum(["apply", "nothing", "referred", "screening"]),
});

export const wayInRequirementSchema = z.discriminatedUnion("type", [
  payRequirementSchema,
  simpleRequirementSchema.extend({ type: z.literal("apply") }),
  simpleRequirementSchema.extend({ type: z.literal("nothing") }),
  simpleRequirementSchema.extend({ type: z.literal("referred") }),
  simpleRequirementSchema.extend({ type: z.literal("screening") }),
]);
export type WayInRequirement = z.infer<typeof wayInRequirementSchema>;

export const wayInSchema = z
  .object({
    /** Stable identity - keys compiledMap so recompiles keep gate node ids. */
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    /** Stored for Phases B-C; not compiled in Phase A. */
    who: z.enum(["anyone", "members", "named-list", "referred", "invited"]).default("anyone"),
    /** AND-stack: every requirement must be satisfied (spec §1 combinator). */
    requirements: z.array(wayInRequirementSchema).min(1).max(8),
    /** Cents. Present iff a `pay` requirement exists; >= $1. */
    priceCents: z.number().int().min(100).optional(),
    approval: z.literal("instant").default("instant"),
    visibility: z.literal("public").default("public"),
  })
  .superRefine((wayIn, ctx) => {
    const hasPay = wayIn.requirements.some((r) => r.type === "pay");
    if (hasPay && wayIn.priceCents === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Way In "${wayIn.label}": a pay requirement needs priceCents (>= 100).`,
      });
    }
    if (!hasPay && wayIn.priceCents !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Way In "${wayIn.label}": priceCents without a pay requirement - free paths use 'nothing' (or another requirement), never pay-at-zero.`,
      });
    }
    const payCount = wayIn.requirements.filter((r) => r.type === "pay").length;
    if (payCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Way In "${wayIn.label}": at most one pay requirement per Way In.`,
      });
    }
  });
export type WayIn = z.infer<typeof wayInSchema>;

/** The persisted document: an ordered, non-empty list. Order is priority -
 *  §2.4 derivation resolves ties by first-satisfied-in-list-order. */
export const waysInListSchema = z
  .array(wayInSchema)
  .min(1)
  .max(24)
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    for (const wayIn of list) {
      if (seen.has(wayIn.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate Way In id "${wayIn.id}" - ids must be unique within an event.`,
        });
      }
      seen.add(wayIn.id);
    }
  });
export type WaysInList = z.infer<typeof waysInListSchema>;

/** wayInId -> the compiled gate node ids (persisted as EventAccessModel.compiledMap).
 *  rootNodeId rides along so the compiler can keep the root stable too. */
export const compiledMapSchema = z.object({
  rootNodeId: z.string().optional(),
  wayIns: z.record(
    z.string(),
    z.object({
      groupNodeId: z.string(),
      conditionNodeIds: z.array(z.string()),
    }),
  ),
});
export type CompiledMap = z.infer<typeof compiledMapSchema>;
