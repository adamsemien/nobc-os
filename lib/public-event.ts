/**
 * Public event DTO — the sponsor-firewall boundary for the /e/[slug] surface.
 *
 * Rules:
 * - Workspace resolved from slug, NEVER from a caller-supplied value.
 * - Every DB query scoped by the resolved workspaceId.
 * - Deliberately reduced projection: display fields only. No member PII, no
 *   operator fields, no psychographics, no internal relationships.
 * - v1 constraint: guestPurchasable is false when guestPriceCents <= 0, which
 *   sidesteps the unverified $0 guest-RSVP path entirely.
 */

import { db } from './db';
import { getEventHeroDisplayUrl } from './event-hero-url';
import { parseEventAccess, resolveAccessForViewer, accessTypeLabel } from './event-access';

// ---------------------------------------------------------------------------
// DTO type — this is the contract prism builds against
// ---------------------------------------------------------------------------

export type PublicTierDTO = {
  id: string;
  name: string;
  description: string | null;
  /** null when tier is not purchasable by a non-member (e.g. member-only tier) */
  nonMemberPriceCents: number | null;
  /** Available = quantity - soldCount - heldCount */
  available: number;
  /** Tier is soldout or closed (available <= 0) */
  soldOut: boolean;
};

export type PublicEventDTO = {
  // Identity
  eventId: string;
  slug: string;
  workspaceId: string; // needed so the checkout page can call /api/e/[slug]/... safely

  // Display
  title: string;
  description: string | null;
  /** ISO 8601 string — DateTime serialized for client */
  startAt: string;
  /** ISO 8601 string — DateTime serialized for client, or null */
  endAt: string | null;
  location: string | null;
  mapsUrl: string | null;
  /** Resolved hero display URL (presign proxy or direct URL). null if no hero. */
  heroImageUrl: string | null;
  /** Template name controlling which client component renders this event */
  template: 'editorial' | 'split' | 'minimal';

  // Access / pricing
  /**
   * Human-readable access label: "Ticketed" | "Apply to Attend" | "Members" | "Open" | "Closed"
   * Derived from guest-viewer resolution. Locked copy per terminology spec.
   */
  accessLabel: string;
  /**
   * Price in cents for a non-member buyer. null when no guest access is configured.
   * 0 is explicitly excluded by guestPurchasable (v1 constraint).
   */
  guestPriceCents: number | null;
  /**
   * true only when: guest access is enabled AND guestPriceCents > 0.
   * false signals "member-only or not publicly purchasable" — page shows
   * an unavailable state rather than a checkout flow.
   */
  guestPurchasable: boolean;

  // Capacity display (coarse — no headcount leakage)
  /**
   * Operator-configured capacity. null when no cap set.
   * Only included when showCapacity is true on the event.
   */
  displayCapacity: number | null;
  /**
   * Confirmed + held seat count. Only included when showCapacity is true.
   * Intentionally coarse — callers should show "X spots left", not exact seat map.
   */
  capacityUsedCount: number | null;

  // Workspace branding tokens (white-label)
  brand: {
    name: string;
    /** Resolved logo URL, or null */
    logoUrl: string | null;
    /** CSS custom-property value for primary color, e.g. "#B22E21". null → use default token. */
    primaryColor: string | null;
  };

  // Ticket tiers (empty array when no tiers configured — use guestPriceCents directly)
  tiers: PublicTierDTO[];
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the public event DTO from a slug.
 *
 * Returns null when:
 * - No event with the slug exists
 * - The event is not PUBLISHED
 * - The event has no guest access (member-only) — caller should 404 or show
 *   a member-only notice; we still return the DTO with guestPurchasable: false
 *   so the page can render the event info without a buy button.
 *
 * Note: Returns DTO even for guestPurchasable: false so the page can still
 * render event details with a "Member access only" state.
 */
export async function buildPublicEventDTO(slug: string): Promise<PublicEventDTO | null> {
  // Step 1: resolve workspace from slug (never from caller)
  const eventRow = await db.event.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      title: true,
      description: true,
      startAt: true,
      endAt: true,
      location: true,
      mapsUrl: true,
      heroImageAssetId: true,
      template: true,
      capacity: true,
      showCapacity: true,
      eventAccess: true,
      ticketTiers: {
        where: { manuallyClosed: false, visibility: 'public' },
        select: {
          id: true,
          name: true,
          description: true,
          nonMemberPriceCents: true,
          quantity: true,
          soldCount: true,
          heldCount: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      workspace: {
        select: {
          name: true,
          logoUrl: true,
          primaryColor: true,
        },
      },
    },
  });

  if (!eventRow) return null;

  const { workspaceId } = eventRow;

  // Step 2: resolve access for a guest viewer
  const access = parseEventAccess(eventRow.eventAccess);
  const resolved = resolveAccessForViewer(access, 'guest');
  const accessLabel = accessTypeLabel(resolved);

  // Derive guest price: from resolved access priceCents (covers both tiered
  // and non-tiered events). Tiers are the authoritative price when present.
  let guestPriceCents: number | null = null;
  if (resolved.kind !== 'closed') {
    guestPriceCents = resolved.priceCents > 0 ? resolved.priceCents : null;
  }

  // v1 constraint: only paid guest access is publicly purchasable
  const guestPurchasable =
    resolved.kind !== 'closed' &&
    (guestPriceCents !== null && guestPriceCents > 0);

  // Step 3: capacity display (only when operator has opted in via showCapacity)
  let capacityUsedCount: number | null = null;
  if (eventRow.showCapacity && eventRow.capacity !== null) {
    // Scoped by workspaceId — the security boundary
    capacityUsedCount = await db.rSVP.count({
      where: {
        workspaceId,
        eventId: eventRow.id,
        ticketStatus: { in: ['confirmed', 'held'] },
      },
    });
  }

  // Step 4: hero URL (no auth required — proxy handles presign)
  const heroImageUrl = getEventHeroDisplayUrl(eventRow.heroImageAssetId);

  // Step 5: tiers — reduced, non-member pricing only
  // Firewall: memberPriceCents deliberately excluded from this projection
  const tiers: PublicTierDTO[] = eventRow.ticketTiers.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    nonMemberPriceCents: t.nonMemberPriceCents,
    available: Math.max(0, t.quantity - t.soldCount - t.heldCount),
    soldOut: t.quantity - t.soldCount - t.heldCount <= 0,
  }));

  return {
    eventId: eventRow.id,
    slug: eventRow.slug,
    workspaceId,
    title: eventRow.title,
    description: eventRow.description,
    startAt: eventRow.startAt.toISOString(),
    endAt: eventRow.endAt?.toISOString() ?? null,
    location: eventRow.location,
    mapsUrl: eventRow.mapsUrl,
    heroImageUrl,
    template: (eventRow.template ?? 'editorial') as 'editorial' | 'split' | 'minimal',
    accessLabel,
    guestPriceCents,
    guestPurchasable,
    displayCapacity: eventRow.showCapacity ? eventRow.capacity : null,
    capacityUsedCount,
    brand: {
      name: eventRow.workspace.name,
      logoUrl: eventRow.workspace.logoUrl,
      primaryColor: eventRow.workspace.primaryColor,
    },
    tiers,
  };
}
