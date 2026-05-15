import { db } from "./db"
import { parseEventAccess, resolveAccessForViewer, type ResolvedAccess, type ViewerKind } from "./event-access"
import { isGateSupported } from "./event-access-schema"

export type OpenResolvedAccess = Exclude<ResolvedAccess, { kind: "closed" }>

export type AccessSubmitInput = {
  workspaceId: string
  eventId: string
  viewer: ViewerKind
  memberId: string | null
  guestEmail?: string
  guestName?: string
  customAnswers?: Record<string, string | boolean | number | null>
}

export type AccessSubmitResult =
  | { ok: true; rsvpId: string; ticketStatus: string; memberQrCode: string | null }
  | { ok: true; waitlisted: true; position: number }
  | { ok: false; status: number; error: string }

/** Resolves access for the event/viewer, validating it's enabled and supported. */
export async function loadAccessContext(
  workspaceId: string,
  eventId: string,
  viewer: ViewerKind,
): Promise<
  | { ok: false; status: number; error: string }
  | {
      ok: true
      resolved: OpenResolvedAccess
      event: {
        id: string
        title: string
        slug: string
        startAt: Date
        location: string | null
        capacity: number | null
        approvalRequired: boolean
      }
    }
> {
  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      location: true,
      capacity: true,
      eventAccess: true,
      approvalRequired: true,
    },
  })
  if (!event) return { ok: false, status: 404, error: "Event not found" }

  const access = parseEventAccess(event.eventAccess)
  const resolved = resolveAccessForViewer(access, viewer)

  if (resolved.kind === "closed") {
    return { ok: false, status: 403, error: resolved.reason }
  }
  if (!isGateSupported(resolved.gate)) {
    return { ok: false, status: 400, error: "This event flow is not available yet." }
  }
  return {
    ok: true,
    resolved,
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      startAt: event.startAt,
      location: event.location,
      capacity: event.capacity,
      approvalRequired: event.approvalRequired,
    },
  }
}

/** Computes price in cents for the resolved access (0 means free). */
export function priceForResolved(resolved: OpenResolvedAccess): number {
  if (/pay/.test(resolved.gate as string)) return resolved.priceCents
  return 0
}

export function gateNeedsApproval(gate: string): boolean {
  return /approval$/.test(gate) || gate === "apply"
}

/**
 * Find or create a GUEST Member for the given workspace by email.
 * Used for non-member ticket buyers.
 */
export async function findOrCreateGuestMember(
  workspaceId: string,
  email: string,
  name: string,
): Promise<{ id: string; email: string; firstName: string; lastName: string; memberQrCode: string | null }> {
  const normalizedEmail = email.trim().toLowerCase()
  const existing = await db.member.findFirst({
    where: { workspaceId, email: normalizedEmail },
    select: { id: true, email: true, firstName: true, lastName: true, memberQrCode: true },
  })
  if (existing) return existing

  const parts = name.trim().split(/\s+/)
  const firstName = parts[0] ?? "Guest"
  const lastName = parts.slice(1).join(" ") || ""

  const created = await db.member.create({
    data: {
      workspaceId,
      clerkUserId: `guest:${normalizedEmail}`,
      email: normalizedEmail,
      firstName,
      lastName,
      status: "GUEST",
      approved: false,
    },
    select: { id: true, email: true, firstName: true, lastName: true, memberQrCode: true },
  })
  return created
}

/** Capacity check; returns false if event is full. */
export async function hasCapacity(
  workspaceId: string,
  eventId: string,
  capacity: number | null,
): Promise<boolean> {
  if (!capacity) return true
  const taken = await db.rSVP.count({
    where: { workspaceId, eventId, ticketStatus: { in: ["confirmed", "held"] } },
  })
  return taken < capacity
}
