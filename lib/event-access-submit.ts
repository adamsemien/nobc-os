import { clerkClient } from "@clerk/nextjs/server"
import { Prisma } from "@prisma/client"
import { db } from "./db"
import { generateMemberQrCode } from "./member-qr"
import { syncMemberChannelConsent } from "./comms/consent-sync"
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

  try {
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
    // Consent floor (reconciliation Phase 1): seed visible, fail-closed PENDING
    // ChannelSubscription rows through the single writer. Fire-and-forget.
    void syncMemberChannelConsent({ workspaceId, memberId: created.id, context: "guest_create" })
    return created
  } catch (err) {
    // Race: a concurrent/retried request (e.g. a buyer double-submitting their own
    // purchase) inserted the same (workspaceId, email) Member between the findFirst
    // above and this create. @@unique([workspaceId, email]) throws P2002; re-fetch
    // the winning row and return it. Mirrors resolveMember's P2002 guard.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await db.member.findFirst({
        where: { workspaceId, email: normalizedEmail },
        select: { id: true, email: true, firstName: true, lastName: true, memberQrCode: true },
      })
      if (raced) return raced
    }
    throw err
  }
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

  try {
    const created = await db.member.create({
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
    // Same PENDING seed as the guest path - operator preview members are
    // visible in the consent tables, never sendable without a real signal.
    void syncMemberChannelConsent({ workspaceId, memberId: created.id, context: "guest_create" })
    return created
  } catch (err) {
    // Pre-existing identity: this operator already has a Member row under the same
    // (workspaceId, email) but a DIFFERENT clerkUserId (e.g. a `guest:email` row
    // minted when they tested the buyer flow), so the clerkUserId pre-check above
    // missed it and this create violates @@unique([workspaceId, email]). Re-fetch
    // the winner by either identity key and return it, mirroring resolveMember /
    // findOrCreateGuestMember's P2002 guard.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const raced = await db.member.findFirst({
        where: { workspaceId, OR: [{ clerkUserId }, { email }] },
        select: { id: true, memberQrCode: true },
      })
      if (raced) return raced
    }
    throw err
  }
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
