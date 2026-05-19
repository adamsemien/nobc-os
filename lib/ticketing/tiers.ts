/** TicketTier CRUD — the shared logic layer.
 *
 *  Consumed by the operator API routes (app/api/operator/ticket-tiers/*) and
 *  the MCP ticketing.tier.* tools. All functions are workspace-scoped and emit
 *  an AuditEvent on every mutation.
 *
 *  Scope rule (XOR): a tier belongs to exactly one of an Event or an
 *  EventSeries — never both, never neither. Enforced here in the app layer and
 *  by the `tier_scope_xor` CHECK constraint in the database. */
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import type { Prisma, TierVisibility, TierTrigger, RefundPolicy } from '@prisma/client';

export class TicketingError extends Error {
  constructor(
    public code: 'not_found' | 'invalid_scope' | 'has_sales' | 'cross_workspace' | 'invalid_quantity',
    message: string,
  ) {
    super(message);
    this.name = 'TicketingError';
  }
}

/** Maps a TicketingError code to an HTTP status for route handlers. */
export function ticketingErrorStatus(code: TicketingError['code']): number {
  switch (code) {
    case 'not_found':
    case 'cross_workspace':
      return 404;
    case 'has_sales':
      return 409;
    case 'invalid_scope':
    case 'invalid_quantity':
      return 422;
  }
}

export interface TierScope {
  eventId?: string | null;
  seriesId?: string | null;
}

export interface CreateTierInput extends TierScope {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  perksJson?: Prisma.InputJsonValue;
  memberPriceCents?: number | null;
  nonMemberPriceCents?: number | null;
  quantity: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  visibility?: TierVisibility;
  autoOpenTrigger?: TierTrigger | null;
  previousTierId?: string | null;
  minPerOrder?: number;
  maxPerOrder?: number;
  refundPolicy?: RefundPolicy | null;
  refundWindowHours?: number | null;
  sortOrder?: number;
}

/** Scope (eventId / seriesId) is immutable after creation — a tier cannot be
 *  moved between events. Everything else is editable. */
export type UpdateTierInput = Partial<Omit<CreateTierInput, 'eventId' | 'seriesId'>>;

function assertExactlyOneScope(eventId?: string | null, seriesId?: string | null): void {
  if (!!eventId === !!seriesId) {
    throw new TicketingError(
      'invalid_scope',
      'A ticket tier must belong to exactly one of an event or a series.',
    );
  }
}

/** Confirms the event / series the tier attaches to lives in this workspace —
 *  prevents attaching a tier across a tenant boundary. */
async function assertScopeOwnership(
  workspaceId: string,
  eventId?: string | null,
  seriesId?: string | null,
): Promise<void> {
  if (eventId) {
    const ev = await db.event.findFirst({ where: { id: eventId, workspaceId }, select: { id: true } });
    if (!ev) throw new TicketingError('cross_workspace', 'Event not found in this workspace.');
  }
  if (seriesId) {
    const series = await db.eventSeries.findFirst({
      where: { id: seriesId, workspaceId },
      select: { id: true },
    });
    if (!series) throw new TicketingError('cross_workspace', 'Series not found in this workspace.');
  }
}

export async function listTicketTiers(workspaceId: string, scope: TierScope) {
  assertExactlyOneScope(scope.eventId, scope.seriesId);
  return db.ticketTier.findMany({
    where: {
      workspaceId,
      ...(scope.eventId ? { eventId: scope.eventId } : { seriesId: scope.seriesId }),
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createTicketTier(
  workspaceId: string,
  actorId: string,
  input: CreateTierInput,
) {
  assertExactlyOneScope(input.eventId, input.seriesId);
  await assertScopeOwnership(workspaceId, input.eventId, input.seriesId);

  // A new tier sorts last within its scope unless an explicit order is given.
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const last = await db.ticketTier.findFirst({
      where: {
        workspaceId,
        ...(input.eventId ? { eventId: input.eventId } : { seriesId: input.seriesId }),
      },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  const tier = await db.ticketTier.create({
    data: {
      workspaceId,
      eventId: input.eventId ?? null,
      seriesId: input.seriesId ?? null,
      name: input.name,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      perksJson: input.perksJson,
      sortOrder,
      memberPriceCents: input.memberPriceCents ?? null,
      nonMemberPriceCents: input.nonMemberPriceCents ?? null,
      quantity: input.quantity,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      visibility: input.visibility ?? 'public',
      autoOpenTrigger: input.autoOpenTrigger ?? null,
      previousTierId: input.previousTierId ?? null,
      minPerOrder: input.minPerOrder ?? 1,
      maxPerOrder: input.maxPerOrder ?? 10,
      refundPolicy: input.refundPolicy ?? null,
      refundWindowHours: input.refundWindowHours ?? null,
    },
  });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'ticket_tier.created',
    entityType: 'TICKET_TIER',
    entityId: tier.id,
    metadata: { name: tier.name, quantity: tier.quantity },
  });

  return tier;
}

export async function updateTicketTier(
  workspaceId: string,
  actorId: string,
  tierId: string,
  input: UpdateTierInput,
) {
  const existing = await db.ticketTier.findFirst({ where: { id: tierId, workspaceId } });
  if (!existing) throw new TicketingError('not_found', 'Ticket tier not found.');

  // Quantity can never drop below tickets already sold or held.
  if (input.quantity !== undefined && input.quantity < existing.soldCount + existing.heldCount) {
    throw new TicketingError(
      'invalid_quantity',
      `Quantity cannot be below the ${existing.soldCount + existing.heldCount} ticket(s) already sold or held.`,
    );
  }

  const tier = await db.ticketTier.update({
    where: { id: tierId },
    data: {
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      perksJson: input.perksJson,
      memberPriceCents: input.memberPriceCents,
      nonMemberPriceCents: input.nonMemberPriceCents,
      quantity: input.quantity,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      visibility: input.visibility,
      autoOpenTrigger: input.autoOpenTrigger,
      previousTierId: input.previousTierId,
      minPerOrder: input.minPerOrder,
      maxPerOrder: input.maxPerOrder,
      refundPolicy: input.refundPolicy,
      refundWindowHours: input.refundWindowHours,
      sortOrder: input.sortOrder,
    },
  });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'ticket_tier.updated',
    entityType: 'TICKET_TIER',
    entityId: tier.id,
  });

  return tier;
}

/** Deletes a tier — only when nothing has been sold or held against it. */
export async function deleteTicketTier(
  workspaceId: string,
  actorId: string,
  tierId: string,
): Promise<void> {
  const existing = await db.ticketTier.findFirst({ where: { id: tierId, workspaceId } });
  if (!existing) throw new TicketingError('not_found', 'Ticket tier not found.');

  if (existing.soldCount > 0 || existing.heldCount > 0) {
    throw new TicketingError(
      'has_sales',
      'Cannot delete a tier that has sold or held tickets. Close it instead.',
    );
  }

  await db.ticketTier.delete({ where: { id: tierId } });

  await emitEvent({
    workspaceId,
    actorId,
    action: 'ticket_tier.deleted',
    entityType: 'TICKET_TIER',
    entityId: tierId,
    metadata: { name: existing.name },
  });
}

/** Rewrites sortOrder to match the given id order. Every id must belong to the
 *  workspace; sortOrder becomes the array index. */
export async function reorderTicketTiers(
  workspaceId: string,
  actorId: string,
  orderedTierIds: string[],
) {
  if (orderedTierIds.length === 0) return [];

  const found = await db.ticketTier.findMany({
    where: { id: { in: orderedTierIds }, workspaceId },
    select: { id: true },
  });
  if (found.length !== orderedTierIds.length) {
    throw new TicketingError('not_found', 'One or more tiers were not found in this workspace.');
  }

  await db.$transaction(
    orderedTierIds.map((id, index) =>
      db.ticketTier.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  await emitEvent({
    workspaceId,
    actorId,
    action: 'ticket_tier.reordered',
    entityType: 'TICKET_TIER',
    entityId: orderedTierIds[0],
    metadata: { count: orderedTierIds.length },
  });

  return db.ticketTier.findMany({
    where: { id: { in: orderedTierIds }, workspaceId },
    orderBy: { sortOrder: 'asc' },
  });
}
