import { db } from './db';

const listSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  heroImageAssetId: true,
  startAt: true,
  endAt: true,
  location: true,
  mapsUrl: true,
  runOfShow: true,
  template: true,
  accessMode: true,
  approvalRequired: true,
  capacity: true,
  showCapacity: true,
  priceInCents: true,
  nonMemberPriceInCents: true,
  eventAccess: true,
} as const;

export async function getPublishedEvents(workspaceId: string) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  return db.event.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      startAt: { gte: cutoff },
    },
    select: listSelect,
    orderBy: { startAt: 'asc' },
  });
}

/** Published events with confirmed headcount for capacity UI. */
export async function getPublishedEventsWithConfirmedCounts(workspaceId: string) {
  const events = await getPublishedEvents(workspaceId);
  if (events.length === 0) return [];
  const ids = events.map(e => e.id);
  const grouped = await db.rSVP.groupBy({
    by: ['eventId'],
    where: { workspaceId, eventId: { in: ids }, ticketStatus: 'confirmed' },
    _count: { _all: true },
  });
  const map = new Map(grouped.map(g => [g.eventId, g._count._all]));
  return events.map(e => ({
    ...e,
    confirmedRsvpCount: map.get(e.id) ?? 0,
  }));
}

/** Load one event for a detail surface.
 *
 *  DRAFT guard (Event Builder Rebuild, Phase C - audit item h): by default a
 *  DRAFT event resolves to null, so a plain signed-in member can no longer
 *  browse unpublished events at /m/events/[slug]. The two legitimate draft
 *  readers opt in explicitly: the public loader's preview entry (authorized
 *  by a signed preview token or a STAFF+ session) and any operator surface
 *  that has already role-checked.
 */
export async function getEventBySlug(
  workspaceId: string,
  slug: string,
  opts?: { includeDraft?: boolean },
) {
  const event = await db.event.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: {
      ...listSelect,
      status: true,
      pageStyle: true,
      plusOnesAllowed: true,
      customQuestions: {
        select: {
          id: true,
          label: true,
          fieldType: true,
          options: true,
          required: true,
          order: true,
          showToMember: true,
          showToGuest: true,
          whenInFlow: true,
        },
        orderBy: { order: 'asc' },
      },
      ticketTiers: {
        where: { manuallyClosed: false },
        select: {
          id: true,
          name: true,
          description: true,
          memberPriceCents: true,
          nonMemberPriceCents: true,
          quantity: true,
          soldCount: true,
          heldCount: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      _count: { select: { rsvps: true } },
    },
  });
  if (!event) return null;
  if (event.status === 'DRAFT' && !opts?.includeDraft) return null;
  return event;
}

export async function getConfirmedRsvpCount(eventId: string): Promise<number> {
  return db.rSVP.count({ where: { eventId, ticketStatus: 'confirmed' } });
}

/** Seats counted against capacity (authorized holds + confirmed). */
export async function getCapacityUsedRsvpCount(eventId: string, workspaceId: string): Promise<number> {
  return db.rSVP.count({
    where: {
      workspaceId,
      eventId,
      ticketStatus: { in: ['confirmed', 'held'] },
    },
  });
}
