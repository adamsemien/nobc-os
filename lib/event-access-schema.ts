import { z } from "zod"
import { GATE_TYPES } from "./event-gates"
import type { Gate, GateType } from "./event-gates"

export type { Gate, GateType }

// Keep FlowStep for legacy references
export const FlowStepSchema = z.enum(["fields", "pay", "approval"])
export type FlowStep = z.infer<typeof FlowStepSchema>

const GateSchema = z.object({
  id: z.string(),
  type: z.enum([...GATE_TYPES] as [GateType, ...GateType[]]),
  label: z.string(),
  capacity: z.number().int().min(0).nullable().optional(),
  approvalRequired: z.boolean().optional(),
  deadline: z.string().nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
  question: z.string().optional(),
  questionType: z.enum(["yes_no", "short_text"]).optional(),
})

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
  gates: z.array(GateSchema).default([]),
  priceCents: z.number().int().min(0),
})
export type GroupAccess = z.infer<typeof GroupAccessSchema>

export const CompAccessSchema = z.object({
  enabled: z.boolean(),
  budgetCap: z.number().int().min(0).nullable(),
})

export const RegistrationStyleSchema = z.enum(["all_at_once", "one_at_a_time"])
export type RegistrationStyle = z.infer<typeof RegistrationStyleSchema>

export const EventAccessSchema = z.object({
  member: GroupAccessSchema,
  guest: GroupAccessSchema,
  comp: CompAccessSchema,
  registrationStyle: RegistrationStyleSchema.optional(),
})
export type EventAccess = z.infer<typeof EventAccessSchema>

export function defaultEventAccess(): EventAccess {
  return {
    member: { enabled: true, gates: [], priceCents: 0 },
    guest: { enabled: false, gates: [], priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
    registrationStyle: "all_at_once",
  }
}

// Legacy helpers — kept for any code that still references them
export function defaultMemberFlow(): FlowStep[] {
  return ["fields", "approval"]
}
export function defaultGuestFlow(): FlowStep[] {
  return ["pay"]
}
