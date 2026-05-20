import type { EventAccess } from "./event-access-schema"
import { deriveFlow } from "./event-access"

export type DerivedLegacy = {
  accessMode: "OPEN" | "TICKETED"
  approvalRequired: boolean
  priceInCents: number | null
  nonMemberPriceInCents: number | null
}

/** Derives Event columns from the gate-based access config.
 *  Approval-gated flows map to TICKETED + approvalRequired: true. */
export function deriveLegacyFromAccess(access: EventAccess): DerivedLegacy {
  const memberFlow = access.member.enabled ? deriveFlow(access.member.gates) : []
  const guestFlow = access.guest.enabled ? deriveFlow(access.guest.gates) : []

  const anyPay = memberFlow.includes("pay") || guestFlow.includes("pay")
  const anyApproval =
    memberFlow.includes("approval") || guestFlow.includes("approval")

  let accessMode: DerivedLegacy["accessMode"] = "OPEN"
  if (anyApproval || anyPay) accessMode = "TICKETED"

  return {
    accessMode,
    approvalRequired: anyApproval,
    priceInCents: access.member.enabled ? access.member.priceCents : null,
    nonMemberPriceInCents: access.guest.enabled
      ? access.guest.priceCents
      : null,
  }
}
