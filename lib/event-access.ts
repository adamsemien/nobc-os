import type { EventAccess, MemberGate, GuestGate } from "./event-access-schema"
import { EventAccessSchema, defaultEventAccess, isGateSupported } from "./event-access-schema"
import type { Member } from "@prisma/client"

export type ViewerKind = "member" | "guest" | "anon"

export type ResolvedAccess =
  | { kind: "member"; gate: MemberGate; priceCents: number; supported: boolean }
  | { kind: "guest"; gate: GuestGate; priceCents: number; supported: boolean }
  | { kind: "closed"; reason: string }

export type StepId = "auth" | "guestInfo" | "fieldsBefore" | "pay" | "fieldsAfter" | "submit"

export type QuestionVisibility = {
  whenInFlow: "BEFORE_SUBMIT" | "AFTER_PAYMENT" | "BEFORE_APPROVAL"
  showToMember: boolean
  showToGuest: boolean
}

export function parseEventAccess(raw: unknown): EventAccess {
  const result = EventAccessSchema.safeParse(raw)
  return result.success ? result.data : defaultEventAccess()
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
        gate: access.member.gate,
        priceCents: access.member.priceCents,
        supported: isGateSupported(access.member.gate),
      }
    }
    if (access.guest.enabled) {
      return {
        kind: "guest",
        gate: access.guest.gate,
        priceCents: access.guest.priceCents,
        supported: isGateSupported(access.guest.gate),
      }
    }
    return { kind: "closed", reason: "This event is not open right now." }
  }
  if (access.guest.enabled) {
    return {
      kind: "guest",
      gate: access.guest.gate,
      priceCents: access.guest.priceCents,
      supported: isGateSupported(access.guest.gate),
    }
  }
  if (access.member.enabled) {
    return { kind: "closed", reason: "This event is open to members only." }
  }
  return { kind: "closed", reason: "Access is not open at this time." }
}

function gateHasPay(gate: string): boolean {
  return /pay/.test(gate)
}

function gateNeedsApproval(gate: string): boolean {
  return /approval$/.test(gate) || gate === "apply"
}

function gateFieldsBeforePay(gate: string): boolean {
  return (
    gate === "questions" ||
    gate === "questions_approval" ||
    gate === "questions_pay" ||
    gate === "questions_pay_approval" ||
    gate === "apply" ||
    gate === "apply_pay"
  )
}

function gateFieldsAfterPay(gate: string): boolean {
  return gate === "pay_questions"
}

export function buildSteps(
  resolved: ResolvedAccess,
  viewer: ViewerKind,
  questions: QuestionVisibility[],
): StepId[] {
  if (resolved.kind === "closed") return []

  const steps: StepId[] = []
  const isMember = resolved.kind === "member"
  const isGuest = resolved.kind === "guest"
  const gate = resolved.gate

  if (isMember && viewer !== "member") {
    steps.push("auth")
  } else if (isGuest && viewer === "anon") {
    steps.push("guestInfo")
  }

  const visibleAt = (when: QuestionVisibility["whenInFlow"]) =>
    questions.filter(
      (q) => q.whenInFlow === when && (isMember ? q.showToMember : q.showToGuest),
    )

  const fieldsBeforeCount = visibleAt("BEFORE_SUBMIT").length + visibleAt("BEFORE_APPROVAL").length
  const fieldsAfterCount = visibleAt("AFTER_PAYMENT").length

  if (gateFieldsBeforePay(gate) && fieldsBeforeCount > 0) {
    steps.push("fieldsBefore")
  } else if (gateNeedsApproval(gate) && fieldsBeforeCount > 0) {
    steps.push("fieldsBefore")
  }

  if (gateHasPay(gate)) {
    steps.push("pay")
  }

  if (gateFieldsAfterPay(gate) && fieldsAfterCount > 0) {
    steps.push("fieldsAfter")
  }

  steps.push("submit")
  return steps
}

export function formatGateCTA(resolved: ResolvedAccess): string {
  if (resolved.kind === "closed") return "Closed"
  const gate = resolved.gate
  if (gate === "apply" || /approval$/.test(gate as string)) {
    return "Apply to Attend"
  }
  if (/pay/.test(gate as string)) {
    const dollars = (resolved.priceCents / 100).toFixed(2).replace(/\.00$/, "")
    return `Get Ticket — $${dollars}`
  }
  if (resolved.kind === "member") return "Reserve My Spot"
  return "Register"
}
