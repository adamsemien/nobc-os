import { z } from "zod"

/**
 * A flow is the ordered list of step blocks an operator stacks after the
 * implicit "Register" anchor. Every group stores its flow directly — the
 * ordered sequence IS the configuration. A "Gate: Approval" step can sit at
 * any position.
 */
export const FlowStepSchema = z.enum(["fields", "pay", "approval"])
export type FlowStep = z.infer<typeof FlowStepSchema>

export const CompTypeSchema = z.enum([
  "sponsor",
  "vendor",
  "staff",
  "press",
  "partner",
  "other",
])
export type CompType = z.infer<typeof CompTypeSchema>

export const GroupAccessSchema = z.object({
  enabled: z.boolean(),
  flow: z.array(FlowStepSchema),
  priceCents: z.number().int().min(0),
})
export type GroupAccess = z.infer<typeof GroupAccessSchema>

export const CompAccessSchema = z.object({
  enabled: z.boolean(),
  budgetCap: z.number().int().min(0).nullable(),
})

export const EventAccessSchema = z.object({
  member: GroupAccessSchema,
  guest: GroupAccessSchema,
  comp: CompAccessSchema,
})
export type EventAccess = z.infer<typeof EventAccessSchema>

/** Default flow for a group the first time it is enabled. */
export function defaultMemberFlow(): FlowStep[] {
  return ["fields", "approval"]
}
export function defaultGuestFlow(): FlowStep[] {
  return ["pay"]
}

export function defaultEventAccess(): EventAccess {
  return {
    member: { enabled: true, flow: defaultMemberFlow(), priceCents: 0 },
    guest: { enabled: false, flow: defaultGuestFlow(), priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
  }
}
