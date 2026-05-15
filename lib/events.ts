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
  applyMode: true,
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

export async function getEventBySlug(workspaceId: string, slug: string) {
  return db.event.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: {
      ...listSelect,
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
      _count: { select: { rsvps: true } },
    },
  });
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
