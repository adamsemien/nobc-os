import type { MemberGate, GuestGate } from "./event-access-schema"
import { isGateSupported } from "./event-access-schema"

/**
 * A flow is the ordered list of step blocks an operator stacks after the
 * implicit "Register" anchor. The ordered sequence maps to a gate enum —
 * order matters (pay-then-fields ≠ fields-then-pay).
 */
export type FlowStep = "fields" | "pay" | "approval"

export const FLOW_STEP_META: Record<FlowStep, { label: string; hint: string }> = {
  fields: { label: "Answer Fields", hint: "Collect registration field answers" },
  pay: { label: "Pay", hint: "Take payment to confirm the spot" },
  approval: { label: "Await Approval", hint: "You review and approve manually" },
}

export type GateResolution<G> = { gate: G; supported: boolean } | null

const MEMBER_MAP: Record<string, MemberGate> = {
  "": "auto_confirm",
  "fields": "questions",
  "pay": "pay",
  "fields,pay": "questions_pay",
  "pay,fields": "pay_questions",
  "fields,approval": "questions_approval",
  "fields,pay,approval": "questions_pay_approval",
  "pay,fields,approval": "questions_pay_approval",
}

const GUEST_MAP: Record<string, GuestGate> = {
  "pay": "pay",
  "fields,pay": "questions_pay",
  "pay,fields": "pay_questions",
  "fields,approval": "apply",
  "fields,pay,approval": "apply_pay",
  "pay,fields,approval": "apply_pay",
}

export function memberGateFromFlow(steps: FlowStep[]): GateResolution<MemberGate> {
  const gate = MEMBER_MAP[steps.join(",")]
  if (!gate) return null
  return { gate, supported: isGateSupported(gate) }
}

export function guestGateFromFlow(steps: FlowStep[]): GateResolution<GuestGate> {
  const gate = GUEST_MAP[steps.join(",")]
  if (!gate) return null
  return { gate, supported: isGateSupported(gate) }
}

export function flowFromMemberGate(gate: MemberGate): FlowStep[] {
  const map: Record<MemberGate, FlowStep[]> = {
    auto_confirm: [],
    questions: ["fields"],
    questions_approval: ["fields", "approval"],
    pay: ["pay"],
    pay_questions: ["pay", "fields"],
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
    pay_questions: ["pay", "fields"],
    questions_pay: ["fields", "pay"],
    apply_pay: ["fields", "pay", "approval"],
  }
  return map[gate] ?? ["pay"]
}

/** "Register → Answer Fields → Pay" */
export function describeFlow(steps: FlowStep[]): string {
  return ["Register", ...steps.map((s) => FLOW_STEP_META[s].label)].join("  →  ")
}

/** Why a guest/member flow has no valid gate — short operator-facing hint. */
export function invalidFlowHint(group: "member" | "guest", steps: FlowStep[]): string {
  if (group === "guest") {
    if (steps.length === 0) {
      return "Guests need a Pay or Await Approval step to register."
    }
    if (steps.length === 1 && steps[0] === "fields") {
      return "Add a Pay or Await Approval step — guests can't register for free."
    }
  }
  return "This combination isn't available yet. Adjust the steps."
}
