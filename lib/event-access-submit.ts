import { clerkClient } from "@clerk/nextjs/server"
import { db } from "./db"
import { generateMemberQrCode } from "./member-qr"
import {
  parseEventAccess,
  resolveAccessForViewer,
  inSessionFlow,
  type ResolvedAccess,
  type ViewerKind,
} from "./event-access"

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

  // Block ticket purchase for past events — startAt in the past means the
  // gathering has already happened. Operator bypass does not exempt this check.
  if (event.startAt < new Date()) {
    return { ok: false, status: 410, error: "This gathering has passed" }
  }

  const access = parseEventAccess(event.eventAccess)
  const resolved = resolveAccessForViewer(access, viewer)

  if (resolved.kind === "closed") {
    return { ok: false, status: 403, error: resolved.reason }
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

/** Price in cents collected in this session (0 means free). Only a Pay step
 * before the first Gate is charged up front. */
export function priceForResolved(resolved: OpenResolvedAccess): number {
  return inSessionFlow(resolved.flow).includes("pay") ? resolved.priceCents : 0
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
      memberQrCode: generateMemberQrCode(),
    },
    select: { id: true, email: true, firstName: true, lastName: true, memberQrCode: true },
  })
  return created
}

/** Find or create the Member row that owns an operator's RSVP. Operators are Clerk
 *  org members without a club Member row; minting a GUEST-status row keyed on their
 *  Clerk ID lets them test/preview the member RSVP flow without inflating the
 *  approved-members list. */
export async function findOrCreateOperatorMember(
  workspaceId: string,
  clerkUserId: string,
): Promise<{ id: string; memberQrCode: string | null }> {
  const existing = await db.member.findFirst({
    where: { workspaceId, clerkUserId },
    select: { id: true, memberQrCode: true },
  })
  if (existing) return existing

  const client = await clerkClient()
  const user = await client.users.getUser(clerkUserId)
  const email = (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    `operator+${clerkUserId}@thenobadcompany.com`
  )
    .trim()
    .toLowerCase()

  return db.member.create({
    data: {
      workspaceId,
      clerkUserId,
      email,
      firstName: user.firstName ?? "Operator",
      lastName: user.lastName ?? "",
      status: "GUEST",
      approved: false,
      memberQrCode: generateMemberQrCode(),
    },
    select: { id: true, memberQrCode: true },
  })
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
