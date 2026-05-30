/** EventSeries CRUD + instance generation — the shared logic layer.
 *
 *  Consumed by the operator API routes (app/api/operator/series/*) and the MCP
 *  series.* tools. All functions are workspace-scoped and emit an AuditEvent on
 *  every mutation.
 *
 *  A series carries an RRULE recurrence plus a set of defaults. generateInstances
 *  expands the rule into concrete Event rows, each inheriting those defaults. */
import { RRule } from 'rrule';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';
import type { EventAccess } from '@/lib/event-access-schema';
import type { EventAccessMode, RefundPolicy } from '@prisma/client';

/** Hard cap on how many instances one generate call may create. */
const MAX_INSTANCES = 200;

/** Builds the canonical three-group EventAccess JSON from a series' default
 *  access mode, so generated instances carry the modern gate-based access object —
 *  not just the legacy `accessMode` column. OPEN → member + guest enabled with no
 *  gates (auto-confirm / free); TICKETED → member + guest each gated by a `ticket`
 *  gate (deriveFlow maps that to a `pay` step). Comp stays disabled. Matches the
 *  GroupAccess/Gate shape in lib/event-access-schema.ts so the member-facing flow
 *  resolves these instances correctly. */
function accessFromMode(mode: EventAccessMode): EventAccess {
  if (mode === 'TICKETED') {
    return {
      member: { enabled: true, gates: [{ id: 'm-ticket', type: 'ticket', label: 'Ticket', priceCents: 0 }], priceCents: 0 },
      guest: { enabled: true, gates: [{ id: 'g-ticket', type: 'ticket', label: 'Ticket', priceCents: 0 }], priceCents: 0 },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    };
  }
  return {
    member: { enabled: true, gates: [], priceCents: 0 },
    guest: { enabled: true, gates: [], priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
    registrationStyle: 'all_at_once',
  };
}

/** Reduces an event's confirmed/held RSVP slice to display metrics, reusing the
 *  same revenue rule as GET /api/operator/events (confirmed + paid, minus refunds). */
export function summarizeRsvps(
  rsvps: { ticketStatus: string; stripePaymentIntentId: string | null; refundAmountCents: number | null }[],
  priceInCents: number | null,
): { confirmedCount: number; revenueCents: number } {
  const confirmedCount = rsvps.filter((r) => r.ticketStatus === 'confirmed').length;
  const revenueCents = rsvps
    .filter((r) => r.ticketStatus === 'confirmed' && r.stripePaymentIntentId != null)
    .reduce((sum, r) => sum + (priceInCents ?? 0) - (r.refundAmountCents ?? 0), 0);
  return { confirmedCount, revenueCents };
}

export class SeriesError extends Error {
  constructor(
    public code: 'not_found' | 'has_orders' | 'invalid_recurrence' | 'unbounded' | 'too_many',
    message: string,
  ) {
    super(message);
    this.name = 'SeriesError';
  }
}

export function seriesErrorStatus(code: SeriesError['code']): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'has_orders':
      return 409;
    case 'invalid_recurrence':
    case 'unbounded':
    case 'too_many':
      return 422;
  }
}

export interface CreateSeriesInput {
  name: string;
  description?: string | null;
  recurrenceRule: string;
  startsAt: Date;
  endsAt?: Date | null;
  count?: number | null;
  defaultHeroImageAssetId?: string | null;
  defaultDescription?: string | null;
  defaultAccessMode?: EventAccessMode;
  defaultPlusOnesAllowed?: boolean;
  defaultRefundPolicy?: RefundPolicy;
  brandColorHex?: string | null;
  active?: boolean;
}

export type UpdateSeriesInput = Partial<CreateSeriesInput>;

/** Throws SeriesError('invalid_recurrence') if the RRULE string does not parse. */
function assertValidRecurrence(rule: string): void {
  try {
    RRule.parseString(rule);
  } catch {
    throw new SeriesError('invalid_recurrence', `"${rule}" is not a valid RRULE string.`);
  }
}

/** Lists every series with rolled-up instance count, confirmed RSVPs, and revenue
 *  across all of the series' Event instances. */
export async function listEventSeries(workspaceId: string) {
  const series = await db.eventSeries.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      events: {
        select: {
          priceInCents: true,
          rsvps: {
            where: { ticketStatus: { in: ['confirmed', 'held'] } },
            select: { ticketStatus: true, stripePaymentIntentId: true, refundAmountCents: true },
          },
        },
      },
    },
  });

  return series.map(({ events, ...s }) => {
    let confirmedCount = 0;
    let revenueCents = 0;
    for (const ev of events) {
      const agg = summarizeRsvps(ev.rsvps, ev.priceInCents);
      confirmedCount += agg.confirmedCount;
      revenueCents += agg.revenueCents;
    }
    return { ...s, instanceCount: events.length, confirmedCount, revenueCents };
  });
}

/** One series with its instances, each carrying confirmed-RSVP + revenue metrics. */
export async function getEventSeriesDetail(workspaceId: string, seriesId: string) {
  const series = await db.eventSeries.findFirst({ where: { id: seriesId, workspaceId } });
  if (!series) throw new SeriesError('not_found', 'Series not found.');

  const events = await db.event.findMany({
    where: { workspaceId, seriesId },
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      startAt: true,
      status: true,
      instanceNumber: true,
      capacity: true,
      priceInCents: true,
      rsvps: {
        where: { ticketStatus: { in: ['confirmed', 'held'] } },
        select: { ticketStatus: true, stripePaymentIntentId: true, refundAmountCents: true },
      },
    },
  });

  const instances = events.map(({ rsvps, priceInCents, ...ev }) => ({
    ...ev,
    ...summarizeRsvps(rsvps, priceInCents),
  }));

  return { series, instances };
}

/** Adds a single ad-hoc instance to a series, inheriting the series defaults
 *  (eventAccess derived from defaultAccessMode, plus-ones, description, hero,
 *  refund policy). instanceNumber auto-increments; slug is workspace-unique. */
export async function addSeriesInstance(
  workspaceId: string,
  actorId: string,
  seriesId: string,
  input: { startAt: Date; title?: string | null; capacity?: number | null },
) {
  const series = await db.eventSeries.findFirst({ where: { id: seriesId, workspaceId } });
  if (!series) throw new SeriesError('not_found', 'Series not found.');

  const existing = await db.event.findMany({
    where: { workspaceId, seriesId },
    select: { instanceNumber: true },
  });
  const instanceNumber =
    existing.reduce((max, e) => Math.max(max, e.instanceNumber ?? 0), 0) + 1;

  const slugBase = slugify(series.name);
  const takenSlugs = new Set(
    (
      await db.event.findMany({
        where: { workspaceId, slug: { startsWith: slugBase } },
        select: { slug: true },
      })
    ).map((e) => e.slug),
  );

  const access = accessFromMode(series.defaultAccessMode);
  const legacy = deriveLegacyFromAccess(access);

  const event = await db.event.create({
    data: {
      workspaceId,
      seriesId,
      instanceNumber,
      recurrenceRule: series.recurrenceRule,
      slug: uniqueSlug(takenSlugs, slugBase, instanceNumber),
      title: input.title?.trim() || `${series.name} #${instanceNumber}`,
      description: series.defaultDescription,
      heroImageAssetId: series.defaultHeroImageAssetId,
      startAt: input.startAt,
      capacity: input.capacity ?? null,
      eventAccess: access as object,
      ...legacy,
      plusOnesAllowed: series.defaultPlusOnesAllowed,
      defaultRefundPolicy: series.defaultRefundPolicy,
    },
    select: { id: true, slug: true, title: true, startAt: true, status: true, instanceNumber: true, capacity: true },
  });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'series.instance_added',
    entityType: 'EVENT_SERIES',
    entityId: seriesId,
    metadata: { eventId: event.id, instanceNumber },
  });

  return { ...event, confirmedCount: 0, revenueCents: 0 };
}

export async function createEventSeries(
  workspaceId: string,
  actorId: string,
  input: CreateSeriesInput,
) {
  assertValidRecurrence(input.recurrenceRule);

  const series = await db.eventSeries.create({
    data: {
      workspaceId,
      name: input.name,
      description: input.description ?? null,
      recurrenceRule: input.recurrenceRule,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      count: input.count ?? null,
      defaultHeroImageAssetId: input.defaultHeroImageAssetId ?? null,
      defaultDescription: input.defaultDescription ?? null,
      defaultAccessMode: input.defaultAccessMode ?? 'OPEN',
      defaultPlusOnesAllowed: input.defaultPlusOnesAllowed ?? false,
      defaultRefundPolicy: input.defaultRefundPolicy ?? 'window',
      brandColorHex: input.brandColorHex ?? null,
      active: input.active ?? true,
    },
  });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'series.created',
    entityType: 'EVENT_SERIES',
    entityId: series.id,
    metadata: { name: series.name },
  });

  return series;
}

export async function updateEventSeries(
  workspaceId: string,
  actorId: string,
  seriesId: string,
  input: UpdateSeriesInput,
) {
  const existing = await db.eventSeries.findFirst({ where: { id: seriesId, workspaceId } });
  if (!existing) throw new SeriesError('not_found', 'Series not found.');

  if (input.recurrenceRule !== undefined) assertValidRecurrence(input.recurrenceRule);

  const series = await db.eventSeries.update({
    where: { id: seriesId },
    data: {
      name: input.name,
      description: input.description,
      recurrenceRule: input.recurrenceRule,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      count: input.count,
      defaultHeroImageAssetId: input.defaultHeroImageAssetId,
      defaultDescription: input.defaultDescription,
      defaultAccessMode: input.defaultAccessMode,
      defaultPlusOnesAllowed: input.defaultPlusOnesAllowed,
      defaultRefundPolicy: input.defaultRefundPolicy,
      brandColorHex: input.brandColorHex,
      active: input.active,
    },
  });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'series.updated',
    entityType: 'EVENT_SERIES',
    entityId: series.id,
  });

  return series;
}

/** Deletes a series — refused if any captured Order is attached to it.
 *  Generated Event instances survive (their seriesId is set null by the FK). */
export async function deleteEventSeries(
  workspaceId: string,
  actorId: string,
  seriesId: string,
): Promise<void> {
  const existing = await db.eventSeries.findFirst({ where: { id: seriesId, workspaceId } });
  if (!existing) throw new SeriesError('not_found', 'Series not found.');

  const capturedOrders = await db.order.count({
    where: { seriesId, workspaceId, paymentStatus: 'CAPTURED' },
  });
  if (capturedOrders > 0) {
    throw new SeriesError(
      'has_orders',
      `Cannot delete a series with ${capturedOrders} captured order(s).`,
    );
  }

  // SeriesSponsor has an ON DELETE RESTRICT FK — clear it before the series.
  await db.$transaction([
    db.seriesSponsor.deleteMany({ where: { seriesId } }),
    db.eventSeries.delete({ where: { id: seriesId } }),
  ]);

  await emitEvent({
    workspaceId,
    actorId,
    action: 'series.deleted',
    entityType: 'EVENT_SERIES',
    entityId: seriesId,
    metadata: { name: existing.name },
  });
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'series'
  );
}

/** Picks a workspace-unique slug, bumping a numeric suffix on collision. */
function uniqueSlug(taken: Set<string>, base: string, instanceNumber: number): string {
  let candidate = `${base}-${instanceNumber}`;
  let attempt = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${instanceNumber}-${attempt}`;
    attempt += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** Expands the series RRULE into concrete DRAFT Event rows. Occurrences that
 *  already have an instance (matched by start time) are skipped, so calling
 *  this twice does not duplicate events. */
export async function generateInstances(
  workspaceId: string,
  actorId: string,
  seriesId: string,
) {
  const series = await db.eventSeries.findFirst({ where: { id: seriesId, workspaceId } });
  if (!series) throw new SeriesError('not_found', 'Series not found.');

  if (!series.count && !series.endsAt) {
    throw new SeriesError(
      'unbounded',
      'Series must set a count or an end date before instances can be generated.',
    );
  }

  let occurrences: Date[];
  try {
    const rule = new RRule({
      ...RRule.parseString(series.recurrenceRule),
      dtstart: series.startsAt,
      count: series.count ?? undefined,
      until: series.endsAt ?? undefined,
    });
    occurrences = rule.all();
  } catch {
    throw new SeriesError('invalid_recurrence', 'Series recurrence rule could not be expanded.');
  }

  if (occurrences.length > MAX_INSTANCES) {
    throw new SeriesError(
      'too_many',
      `Recurrence expands to ${occurrences.length} instances — the limit is ${MAX_INSTANCES}.`,
    );
  }

  const existing = await db.event.findMany({
    where: { workspaceId, seriesId },
    select: { startAt: true, instanceNumber: true },
  });
  const existingStarts = new Set(existing.map((e) => e.startAt.getTime()));
  let nextInstanceNumber =
    existing.reduce((max, e) => Math.max(max, e.instanceNumber ?? 0), 0) + 1;

  const slugBase = slugify(series.name);
  const takenSlugs = new Set(
    (
      await db.event.findMany({
        where: { workspaceId, slug: { startsWith: slugBase } },
        select: { slug: true },
      })
    ).map((e) => e.slug),
  );

  const newOccurrences = occurrences.filter((d) => !existingStarts.has(d.getTime()));

  // Inherit the modern eventAccess JSON (+ the legacy scalar columns it derives)
  // from the series default — the previous code set only `accessMode`, leaving
  // instances on the schema-default eventAccess regardless of the series mode.
  const access = accessFromMode(series.defaultAccessMode);
  const legacy = deriveLegacyFromAccess(access);

  const rows = newOccurrences.map((startAt) => {
    const instanceNumber = nextInstanceNumber++;
    return {
      workspaceId,
      seriesId,
      instanceNumber,
      recurrenceRule: series.recurrenceRule,
      slug: uniqueSlug(takenSlugs, slugBase, instanceNumber),
      title: `${series.name} #${instanceNumber}`,
      description: series.defaultDescription,
      heroImageAssetId: series.defaultHeroImageAssetId,
      startAt,
      eventAccess: access as object,
      ...legacy,
      plusOnesAllowed: series.defaultPlusOnesAllowed,
      defaultRefundPolicy: series.defaultRefundPolicy,
    };
  });

  if (rows.length > 0) {
    await db.event.createMany({ data: rows });
  }

  await emitEvent({
    workspaceId,
    actorId,
    action: 'series.instances_generated',
    entityType: 'EVENT_SERIES',
    entityId: seriesId,
    metadata: { created: rows.length, skipped: occurrences.length - rows.length },
  });

  return {
    created: rows.length,
    skipped: occurrences.length - rows.length,
    instances: await db.event.findMany({
      where: { workspaceId, seriesId },
      orderBy: { startAt: 'asc' },
      select: { id: true, slug: true, title: true, startAt: true, status: true, instanceNumber: true },
    }),
  };
}
