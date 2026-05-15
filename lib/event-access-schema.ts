import { z } from "zod"

export const MemberGateSchema = z.enum([
  "auto_confirm",
  "questions",
  "questions_approval",
  "pay",
  "pay_questions",
  "questions_pay",
  "questions_pay_approval",
])
export type MemberGate = z.infer<typeof MemberGateSchema>

export const GuestGateSchema = z.enum([
  "pay",
  "apply",
  "pay_questions",
  "questions_pay",
  "apply_pay",
  "questions_approval",
])
export type GuestGate = z.infer<typeof GuestGateSchema>

export const CompTypeSchema = z.enum([
  "sponsor",
  "vendor",
  "staff",
  "press",
  "partner",
  "other",
])
export type CompType = z.infer<typeof CompTypeSchema>

export const MemberAccessSchema = z.object({
  enabled: z.boolean(),
  gate: MemberGateSchema,
  priceCents: z.number().int().min(0),
})

export const GuestAccessSchema = z.object({
  enabled: z.boolean(),
  gate: GuestGateSchema,
  priceCents: z.number().int().min(0),
})

export const CompAccessSchema = z.object({
  enabled: z.boolean(),
  budgetCap: z.number().int().min(0).nullable(),
})

export const EventAccessSchema = z.object({
  member: MemberAccessSchema,
  guest: GuestAccessSchema,
  comp: CompAccessSchema,
})
export type EventAccess = z.infer<typeof EventAccessSchema>

export function defaultEventAccess(): EventAccess {
  return {
    member: { enabled: true, gate: "auto_confirm", priceCents: 0 },
    guest: { enabled: false, gate: "pay", priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
  }
}

export const UNSUPPORTED_GATES = new Set<string>([
  "questions_pay_approval",
  "apply_pay",
])

export function isGateSupported(gate: string): boolean {
  return !UNSUPPORTED_GATES.has(gate)
}
