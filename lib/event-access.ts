import type { EventAccess, FlowStep } from "./event-access-schema"
import { EventAccessSchema, defaultEventAccess } from "./event-access-schema"
import type { Member } from "@prisma/client"

export type ViewerKind = "member" | "guest" | "anon"

export type ResolvedAccess =
  | { kind: "member"; flow: FlowStep[]; priceCents: number }
  | { kind: "guest"; flow: FlowStep[]; priceCents: number }
  | { kind: "closed"; reason: string }

export type StepId = "auth" | "guestInfo" | "fieldsBefore" | "pay" | "fieldsAfter" | "submit"

export type QuestionVisibility = {
  whenInFlow: "BEFORE_SUBMIT" | "AFTER_PAYMENT" | "BEFORE_APPROVAL"
  showToMember: boolean
  showToGuest: boolean
}

/** Legacy gate enums → ordered flow, for events stored before the flow rebuild. */
const LEGACY_MEMBER_GATE: Record<string, FlowStep[]> = {
  auto_confirm: [],
  questions: ["fields"],
  questions_approval: ["fields", "approval"],
  pay: ["pay"],
  pay_questions: ["pay", "fields"],
  questions_pay: ["fields", "pay"],
  questions_pay_approval: ["fields", "pay", "approval"],
}
const LEGACY_GUEST_GATE: Record<string, FlowStep[]> = {
  pay: ["pay"],
  apply: ["fields", "approval"],
  questions_approval: ["fields", "approval"],
  pay_questions: ["pay", "fields"],
  questions_pay: ["fields", "pay"],
  apply_pay: ["fields", "pay", "approval"],
}

function migrateLegacyAccess(raw: unknown): EventAccess | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, Record<string, unknown>>
  if (!r.member || !r.guest) return null
  if (!("gate" in r.member) && !("gate" in r.guest)) return null
  const def = defaultEventAccess()
  return {
    member: {
      enabled: Boolean(r.member.enabled),
      flow: LEGACY_MEMBER_GATE[String(r.member.gate)] ?? [],
      priceCents: Number(r.member.priceCents) || 0,
    },
    guest: {
      enabled: Boolean(r.guest.enabled),
      flow: LEGACY_GUEST_GATE[String(r.guest.gate)] ?? ["pay"],
      priceCents: Number(r.guest.priceCents) || 0,
    },
    comp: r.comp
      ? {
          enabled: Boolean(r.comp.enabled),
          budgetCap:
            r.comp.budgetCap == null ? null : Number(r.comp.budgetCap) || 0,
        }
      : def.comp,
  }
}

export function parseEventAccess(raw: unknown): EventAccess {
  const result = EventAccessSchema.safeParse(raw)
  if (result.success) return result.data
  const migrated = migrateLegacyAccess(raw)
  if (migrated) {
    const revalidated = EventAccessSchema.safeParse(migrated)
    if (revalidated.success) return revalidated.data
  }
  return defaultEventAccess()
}

export function resolveViewer(
  member: Pick<Member, "status"> | null,
  clerkUserId: string | null,
): ViewerKind {
  if (member && member.status === "APPROVED") return "member"
  if (clerkUserId || member) return "guest"
  return "anon"
}

export function resolveAccessForViewer(
  access: EventAccess,
  viewer: ViewerKind,
): ResolvedAccess {
  if (viewer === "member") {
    if (access.member.enabled) {
      return {
        kind: "member",
        flow: access.member.flow,
        priceCents: access.member.priceCents,
      }
    }
    if (access.guest.enabled) {
      return {
        kind: "guest",
        flow: access.guest.flow,
        priceCents: access.guest.priceCents,
      }
    }
    return { kind: "closed", reason: "This event is not open right now." }
  }
  if (access.guest.enabled) {
    return {
      kind: "guest",
      flow: access.guest.flow,
      priceCents: access.guest.priceCents,
    }
  }
  if (access.member.enabled) {
    return { kind: "closed", reason: "This event is open to members only." }
  }
  return { kind: "closed", reason: "Access is not open at this time." }
}

/** The portion of a flow that runs in a single session — everything up to the first gate. */
export function inSessionFlow(flow: FlowStep[]): FlowStep[] {
  const gateIdx = flow.indexOf("approval")
  return gateIdx === -1 ? flow : flow.slice(0, gateIdx)
}

/** A flow with a Gate step needs operator approval before the person is fully in. */
export function flowNeedsApproval(flow: FlowStep[]): boolean {
  return flow.includes("approval")
}

export function buildSteps(
  resolved: ResolvedAccess,
  viewer: ViewerKind,
  questions: QuestionVisibility[],
): StepId[] {
  if (resolved.kind === "closed") return []

  const steps: StepId[] = []
  const isMember = resolved.kind === "member"

  if (isMember && viewer !== "member") {
    steps.push("auth")
  } else if (!isMember && viewer !== "member") {
    steps.push("guestInfo")
  }

  const visibleCount = questions.filter((q) =>
    isMember ? q.showToMember : q.showToGuest,
  ).length

  // Only the steps before the first gate happen in this session.
  for (const step of inSessionFlow(resolved.flow)) {
    if (step === "fields") {
      if (visibleCount > 0) steps.push("fieldsBefore")
    } else if (step === "pay") {
      steps.push("pay")
    }
  }

  steps.push("submit")
  return steps
}

export function formatGateCTA(resolved: ResolvedAccess): string {
  if (resolved.kind === "closed") return "Closed"
  const flow = resolved.flow
  const session = inSessionFlow(flow)
  if (session.includes("pay")) {
    const dollars = (resolved.priceCents / 100).toFixed(2).replace(/\.00$/, "")
    return `Get Ticket — $${dollars}`
  }
  if (flow.includes("approval")) return "Apply to Attend"
  if (resolved.kind === "member") return "Reserve My Spot"
  return "Register"
}

/** Short access-type badge: Ticketed / Apply to Attend / Members / Open / Closed. */
export function accessTypeLabel(resolved: ResolvedAccess): string {
  if (resolved.kind === "closed") return "Closed"
  if (resolved.flow.includes("pay")) return "Ticketed"
  if (resolved.flow.includes("approval")) return "Apply to Attend"
  if (resolved.kind === "member") return "Members"
  return "Open"
}
