import type { EventAccess } from "./event-access-schema"
import { deriveFlow } from "./event-access"

export type DerivedLegacy = {
  accessMode: "OPEN" | "TICKETED" | "APPLY_OR_PAY"
  applyMode: "APPROVAL_HOLDS_TICKET" | null
  approvalRequired: boolean
  priceInCents: number | null
  nonMemberPriceInCents: number | null
}

/** Derives the legacy Event columns from the gate-based access config. */
export function deriveLegacyFromAccess(access: EventAccess): DerivedLegacy {
  const memberFlow = access.member.enabled ? deriveFlow(access.member.gates) : []
  const guestFlow = access.guest.enabled ? deriveFlow(access.guest.gates) : []

  const anyPay = memberFlow.includes("pay") || guestFlow.includes("pay")
  const anyApproval =
    memberFlow.includes("approval") || guestFlow.includes("approval")

  let accessMode: DerivedLegacy["accessMode"] = "OPEN"
  if (anyApproval) accessMode = "APPLY_OR_PAY"
  else if (anyPay) accessMode = "TICKETED"

  return {
    accessMode,
    applyMode: anyApproval ? "APPROVAL_HOLDS_TICKET" : null,
    approvalRequired: anyApproval,
    priceInCents: access.member.enabled ? access.member.priceCents : null,
    nonMemberPriceInCents: access.guest.enabled
      ? access.guest.priceCents
      : null,
  }
}
