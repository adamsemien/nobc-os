import type { MemberGate, GuestGate } from "./event-access-schema"
import { isGateSupported } from "./event-access-schema"

/**
 * A flow is built from optional step blocks the operator adds after the
 * implicit "Register" anchor. The ordered set of blocks maps to a gate enum.
 */
export type FlowStep = "fields" | "pay" | "approval"

export const FLOW_STEP_META: Record<FlowStep, { label: string; hint: string }> = {
  fields: { label: "Answer Fields", hint: "Collect registration field answers" },
  pay: { label: "Pay", hint: "Take payment to confirm the spot" },
  approval: { label: "Await Approval", hint: "You review and approve manually" },
}

const CANON_ORDER: FlowStep[] = ["fields", "pay", "approval"]

/** Sort steps into canonical order and dedupe. */
export function canonicalizeFlow(steps: FlowStep[]): FlowStep[] {
  return CANON_ORDER.filter((s) => steps.includes(s))
}

export type GateResolution<G> =
  | { gate: G; supported: boolean }
  | null

export function memberGateFromFlow(steps: FlowStep[]): GateResolution<MemberGate> {
  const key = canonicalizeFlow(steps).join(",")
  const map: Record<string, MemberGate> = {
    "": "auto_confirm",
    "fields": "questions",
    "fields,approval": "questions_approval",
    "pay": "pay",
    "fields,pay": "questions_pay",
    "fields,pay,approval": "questions_pay_approval",
  }
  const gate = map[key]
  if (!gate) return null
  return { gate, supported: isGateSupported(gate) }
}

export function guestGateFromFlow(steps: FlowStep[]): GateResolution<GuestGate> {
  const key = canonicalizeFlow(steps).join(",")
  const map: Record<string, GuestGate> = {
    "pay": "pay",
    "fields,approval": "apply",
    "fields,pay": "questions_pay",
    "fields,pay,approval": "apply_pay",
  }
  const gate = map[key]
  if (!gate) return null
  return { gate, supported: isGateSupported(gate) }
}

export function flowFromMemberGate(gate: MemberGate): FlowStep[] {
  const map: Record<MemberGate, FlowStep[]> = {
    auto_confirm: [],
    questions: ["fields"],
    questions_approval: ["fields", "approval"],
    pay: ["pay"],
    pay_questions: ["fields", "pay"],
    questions_pay: ["fields", "pay"],
    questions_pay_approval: ["fields", "pay", "approval"],
  }
  return map[gate] ?? []
}

export function flowFromGuestGate(gate: GuestGate): FlowStep[] {
  const map: Record<GuestGate, FlowStep[]> = {
    pay: ["pay"],
    apply: ["fields", "approval"],
    questions_approval: ["fields", "approval"],
    pay_questions: ["fields", "pay"],
    questions_pay: ["fields", "pay"],
    apply_pay: ["fields", "pay", "approval"],
  }
  return map[gate] ?? ["pay"]
}

/** "Register → Answer Fields → Pay" */
export function describeFlow(steps: FlowStep[]): string {
  const parts = ["Register", ...canonicalizeFlow(steps).map((s) => FLOW_STEP_META[s].label)]
  return parts.join("  →  ")
}

/** Why a guest/member flow has no valid gate — short operator-facing hint. */
export function invalidFlowHint(group: "member" | "guest", steps: FlowStep[]): string {
  if (group === "guest") {
    const has = canonicalizeFlow(steps)
    if (has.length === 0) return "Guests need at least a Pay or Await Approval step."
    if (has.length === 1 && has[0] === "fields") {
      return "Add a Pay or Await Approval step — guests can't register for free."
    }
  }
  return "This combination isn't available. Adjust the steps."
}
