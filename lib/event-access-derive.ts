import type { EventAccess } from "./event-access-schema"

export type DerivedLegacy = {
  accessMode: "OPEN" | "TICKETED" | "APPLY_OR_PAY"
  applyMode: "APPROVAL_HOLDS_TICKET" | null
  approvalRequired: boolean
  priceInCents: number | null
  nonMemberPriceInCents: number | null
}

export function deriveLegacyFromAccess(access: EventAccess): DerivedLegacy {
  const memberPay = access.member.enabled && /pay/.test(access.member.gate)
  const guestPay = access.guest.enabled && /pay/.test(access.guest.gate)
  const anyPay = memberPay || guestPay

  const memberApproval = access.member.enabled && /approval$/.test(access.member.gate)
  const guestApproval =
    access.guest.enabled &&
    (access.guest.gate === "apply" || /approval$/.test(access.guest.gate))
  const anyApproval = memberApproval || guestApproval

  let accessMode: DerivedLegacy["accessMode"] = "OPEN"
  if (anyPay && (anyApproval || access.guest.enabled)) {
    accessMode = anyPay && (anyApproval || (access.member.enabled && access.guest.enabled))
      ? (anyApproval ? "APPLY_OR_PAY" : "TICKETED")
      : "TICKETED"
  } else if (anyPay) {
    accessMode = "TICKETED"
  } else if (anyApproval) {
    accessMode = "APPLY_OR_PAY"
  }

  return {
    accessMode,
    applyMode: anyApproval ? "APPROVAL_HOLDS_TICKET" : null,
    approvalRequired: anyApproval,
    priceInCents: access.member.enabled ? access.member.priceCents : null,
    nonMemberPriceInCents: access.guest.enabled ? access.guest.priceCents : null,
  }
}
