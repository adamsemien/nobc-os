export type { FlowStep } from "./event-access-schema"
export { GATE_META, GATE_TYPES, newGate } from "./event-gates"
export type { Gate, GateType } from "./event-gates"

// Legacy — kept for any remaining references
export const FLOW_STEP_META = {
  fields: { label: "Answer Fields", short: "Fields", hint: "Collect registration field answers" },
  pay: { label: "Pay", short: "Pay", hint: "Take payment to confirm the spot" },
  approval: { label: "Gate: Approval", short: "Gate", hint: "You review and approve before they continue" },
} as const

export function describeFlow(steps: string[]): string {
  return ["Register", ...steps].join("  →  ")
}
