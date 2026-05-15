import type { FlowStep } from "./event-access-schema"

export type { FlowStep }

export const FLOW_STEP_META: Record<
  FlowStep,
  { label: string; short: string; hint: string }
> = {
  fields: {
    label: "Answer Fields",
    short: "Fields",
    hint: "Collect registration field answers",
  },
  pay: {
    label: "Pay",
    short: "Pay",
    hint: "Take payment to confirm the spot",
  },
  approval: {
    label: "Gate: Approval",
    short: "Gate",
    hint: "A pause point — you review and approve before they continue",
  },
}

/** "Register → Answer Fields → Gate: Approval" */
export function describeFlow(steps: FlowStep[]): string {
  return ["Register", ...steps.map((s) => FLOW_STEP_META[s].label)].join("  →  ")
}
