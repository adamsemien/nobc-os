import { z } from 'zod';
import { randomBytes } from 'crypto';
import { MemberStatus, OperatorRole, TagEntityType } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { mcpMetrics, runMetric } from '@/lib/intelligence';
import type { MetricFilters } from '@/lib/intelligence';
import { composeInsight } from '@/lib/intelligence/composer';
import {
  createTicketTier,
  updateTicketTier,
  closeTicketTier,
  listTicketTiers,
  reorderTicketTiers,
} from '@/lib/ticketing/tiers';
import {
  CreateTierSchema,
  UpdateTierSchema,
  toCreateTierInput,
  toUpdateTierInput,
} from '@/lib/ticketing/tier-schema';
import { createEventSeries, updateEventSeries, listEventSeries, generateInstances } from '@/lib/series';
import {
  CreateSeriesSchema,
  UpdateSeriesSchema,
  toCreateSeriesInput,
  toUpdateSeriesInput,
} from '@/lib/series-schema';
import type { McpTool } from './types';

/**
 * Tools that predate the V1 `nobc_*` surface and remain valuable: the
 * Intelligence metric family (auto-registered), ticketing tiers, recurring
 * series, tags, comp issuance, waitlist promotion, and the red list. They take
 * loosely-typed args (documented in each description); the schema is a
 * pass-through object. The basic CRUD that these once included is superseded by
 * the typed `nobc_*` tools and intentionally dropped.
 */
type LegacyHandler = (
  workspaceId: string,
  args: Record<string, unknown>,
  userId: string,
) => Promise<unknown>;
type LegacyMap = Record<string, { description: string; handler: LegacyHandler }>;

const passthrough = z.record(z.string(), z.unknown());

function adapt(map: LegacyMap, isDestructive: (name: string) => boolean): McpTool[] {
  return Object.entries(map).map(([name, t]) => {
    const destructive = isDestructive(name);
    return {
      name,
      description: t.description,
      inputSchema: passthrough,
      destructive,
      // Legacy `destructive` accurately tracks write-vs-read, so the auth floor
      // follows it: writes require STAFF, reads (intelligence.*, .list, .get)
      // open to READ_ONLY. Mirrors the typed-tool convention.
      minRole: destructive ? OperatorRole.STAFF : OperatorRole.READ_ONLY,
      handler: (ctx, args) => t.handler(ctx.workspaceId, args, ctx.userId),
    };
  });
}

function uniqueTools(): LegacyMap {
  return {
    add_to_red_list: {
      description: 'Add an email to the workspace red list',
      handler: async (workspaceId, args, userId) => {
        const entry = await db.redList.create({
          data: {
            workspaceId,
            email: String(args.email),
            reason: args.reason ? String(args.reason) : undefined,
          },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'redlist.added',
          entityType: 'RED_LIST',
          entityId: entry.id,
          metadata: { email: entry.email, via: 'mcp' },
        });
        return entry;
      },
    },
    issue_comp_ticket: {
      description: 'Issue a complimentary RSVP to an attendee by email',
      handler: async (workspaceId, args, userId) => {
        const eventId = String(args.eventId);
        const email = String(args.email);
        const firstName = String(args.firstName ?? '');
        const lastName = String(args.lastName ?? '');
        const compType = args.compType ? String(args.compType) : 'comp';

        const event = await db.event.findFirst({ where: { id: eventId, workspaceId } });
        if (!event) throw new Error('Event not found or not in this workspace');

        let member = await db.member.findUnique({
          where: { workspaceId_email: { workspaceId, email } },
          select: { id: true },
        });
        if (!member) {
          member = await db.member.create({
            data: {
              workspaceId,
              clerkUserId: `comp:${email}`,
              email,
              firstName,
              lastName,
              status: MemberStatus.GUEST,
              memberQrCode: randomBytes(8).toString('hex'),
            },
            select: { id: true },
          });
          await emitEvent({
            workspaceId,
            actorId: userId,
            actorType: 'AGENT',
            action: 'member.created',
            entityType: 'MEMBER',
            entityId: member.id,
            metadata: { email, via: 'mcp_comp' },
          });
        }

        const existing = await db.rSVP.findFirst({
          where: { workspaceId, eventId, memberId: member.id },
          select: { id: true, ticketStatus: true },
        });
        if (existing && (existing.ticketStatus === 'confirmed' || existing.ticketStatus === 'comp')) {
          return { rsvp: existing, alreadyExists: true };
        }

        const rsvp = await db.rSVP.upsert({
          where: { workspaceId_eventId_memberId: { workspaceId, eventId, memberId: member.id } },
          create: {
            workspaceId,
            eventId,
            memberId: member.id,
            status: 'CONFIRMED',
            ticketStatus: 'confirmed',
            isComp: true,
            compType,
            origin: 'mcp_comp',
          },
          update: { status: 'CONFIRMED', ticketStatus: 'confirmed', isComp: true, compType },
        });

        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'rsvp.created',
          entityType: 'RSVP',
          entityId: rsvp.id,
          metadata: { isComp: true, compType, email, via: 'mcp' },
        });

        return { rsvp, alreadyExists: false };
      },
    },
    promote_from_waitlist: {
      description: 'Promote a waitlisted RSVP to confirmed',
      handler: async (workspaceId, args, userId) => {
        const rsvpId = String(args.rsvpId);
        const rsvp = await db.rSVP.findFirst({
          where: { id: rsvpId, workspaceId },
          select: { id: true, ticketStatus: true, eventId: true, memberId: true },
        });
        if (!rsvp) throw new Error('RSVP not found or not in this workspace');
        if (rsvp.ticketStatus !== 'waitlisted' && rsvp.ticketStatus !== 'pending_approval') {
          throw new Error(`RSVP is not on the waitlist (current status: ${rsvp.ticketStatus})`);
        }
        const updated = await db.rSVP.update({
          where: { id: rsvpId },
          data: { status: 'CONFIRMED', ticketStatus: 'confirmed' },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'rsvp.confirmed',
          entityType: 'RSVP',
          entityId: rsvpId,
          metadata: { promotedFromWaitlist: true, eventId: rsvp.eventId, via: 'mcp' },
        });
        return updated;
      },
    },
  };
}

/** Auto-registers every mcpExposed Intelligence metric as `intelligence.{id}`. */
function intelligenceTools(): LegacyMap {
  const out: LegacyMap = {};
  for (const metric of mcpMetrics()) {
    out[`intelligence.${metric.id}`] = {
      description: `${metric.name} — ${metric.businessQuestion}`,
      handler: async (workspaceId, args) => {
        const dr = args.dateRange as { from?: string; to?: string } | undefined;
        return runMetric(metric.id, {
          workspaceId,
          dateRange: dr?.from && dr?.to ? { from: new Date(dr.from), to: new Date(dr.to) } : undefined,
          filters: (args.filters as MetricFilters | undefined) ?? undefined,
          comparePeriod: 'previous',
        });
      },
    };
  }
  out['intelligence.compose'] = {
    description:
      'Compose a custom insight — a natural-language question becomes selected metrics plus a synthesized narrative',
    handler: async (workspaceId, args) => {
      const dr = args.dateRange as { from?: string; to?: string } | undefined;
      return composeInsight(String(args.question ?? ''), {
        workspaceId,
        dateRange: dr?.from && dr?.to ? { from: new Date(dr.from), to: new Date(dr.to) } : undefined,
        filters: (args.filters as MetricFilters | undefined) ?? undefined,
        comparePeriod: 'previous',
      });
    },
  };
  return out;
}

function parseEntityType(value: unknown): TagEntityType {
  const v = String(value);
  if ((Object.values(TagEntityType) as string[]).includes(v)) return v as TagEntityType;
  throw new Error(`Invalid entityType "${v}" — expected one of ${Object.values(TagEntityType).join(', ')}`);
}

/** Ticketing V2 + series + tag tool surface. Handlers wrap the shared logic
 *  layers (lib/ticketing/tiers, lib/series) and direct tag queries. */
function ticketingTools(): LegacyMap {
  const slugify = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tag';

  const stub = (tool: string, message: string): LegacyMap[string] => ({
    description: `[not implemented] ${message}`,
    handler: async () => ({ status: 'not_implemented', tool, message }),
  });

  return {
    'ticketing.tier.create': {
      description:
        'Create a ticket tier. Args: eventId XOR seriesId, name, quantity, optional memberPriceCents / nonMemberPriceCents, visibility, startsAt / endsAt, minPerOrder / maxPerOrder, refundPolicy.',
      handler: async (workspaceId, args, userId) =>
        createTicketTier(workspaceId, userId, toCreateTierInput(CreateTierSchema.parse(args))),
    },
    'ticketing.tier.update': {
      description: 'Update a ticket tier. Args: tierId, plus any tier fields to change.',
      handler: async (workspaceId, args, userId) => {
        const { tierId, ...rest } = args;
        return updateTicketTier(
          workspaceId,
          userId,
          String(tierId),
          toUpdateTierInput(UpdateTierSchema.parse(rest)),
        );
      },
    },
    'ticketing.tier.close': {
      description: 'Close a ticket tier — soft delete, sets manuallyClosed. Args: tierId.',
      handler: async (workspaceId, args, userId) =>
        closeTicketTier(workspaceId, userId, String(args.tierId)),
    },
    'ticketing.tier.list': {
      description: 'List ticket tiers for an event or series. Args: eventId XOR seriesId.',
      handler: async (workspaceId, args) =>
        listTicketTiers(workspaceId, {
          eventId: args.eventId ? String(args.eventId) : undefined,
          seriesId: args.seriesId ? String(args.seriesId) : undefined,
        }),
    },
    'ticketing.tier.reorder': {
      description: 'Reorder ticket tiers. Args: tierIds — string[] in the desired order.',
      handler: async (workspaceId, args, userId) =>
        reorderTicketTiers(workspaceId, userId, (args.tierIds as string[]) ?? []),
    },

    'series.create': {
      description:
        'Create a recurring event series. Args: name, recurrenceRule (RRULE string), startsAt, count or endsAt, optional defaults.',
      handler: async (workspaceId, args, userId) =>
        createEventSeries(workspaceId, userId, toCreateSeriesInput(CreateSeriesSchema.parse(args))),
    },
    'series.update': {
      description: 'Update an event series. Args: seriesId, plus any series fields to change.',
      handler: async (workspaceId, args, userId) => {
        const { seriesId, ...rest } = args;
        return updateEventSeries(
          workspaceId,
          userId,
          String(seriesId),
          toUpdateSeriesInput(UpdateSeriesSchema.parse(rest)),
        );
      },
    },
    'series.list': {
      description: 'List every event series in the workspace.',
      handler: async (workspaceId) => listEventSeries(workspaceId),
    },
    'series.generate_instances': {
      description: 'Expand a series RRULE into draft Event instances. Args: seriesId.',
      handler: async (workspaceId, args, userId) =>
        generateInstances(workspaceId, userId, String(args.seriesId)),
    },
    'series.cancel': {
      description: 'Cancel a series — deactivates it (active=false). Args: seriesId.',
      handler: async (workspaceId, args, userId) =>
        updateEventSeries(workspaceId, userId, String(args.seriesId), { active: false }),
    },

    'tag.create': {
      description: 'Create a tag. Args: name, optional slug, category, color, description.',
      handler: async (workspaceId, args, userId) => {
        const name = String(args.name ?? '').trim();
        if (!name) throw new Error('tag.create requires a name');
        const tag = await db.tag.create({
          data: {
            workspaceId,
            name,
            slug: slugify(String(args.slug ?? name)),
            category: args.category ? String(args.category) : null,
            color: args.color ? String(args.color) : null,
            description: args.description ? String(args.description) : null,
          },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'tag.created',
          entityType: 'TAG',
          entityId: tag.id,
          metadata: { name: tag.name, via: 'mcp' },
        });
        return tag;
      },
    },
    'tag.list': {
      description: 'List tags in the workspace. Optional arg: category.',
      handler: async (workspaceId, args) =>
        db.tag.findMany({
          where: { workspaceId, ...(args.category ? { category: String(args.category) } : {}) },
          orderBy: { name: 'asc' },
        }),
    },
    'tag.apply': {
      description:
        'Apply a tag to an entity. Args: tagId, entityType (member|event|series|order|application|rsvp), entityId, optional appliedBy.',
      handler: async (workspaceId, args, userId) => {
        const entityType = parseEntityType(args.entityType);
        const tagId = String(args.tagId);
        const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId }, select: { id: true } });
        if (!tag) throw new Error('Tag not found in this workspace');
        const entityId = String(args.entityId);
        const appliedBy = args.appliedBy ? String(args.appliedBy) : userId;
        const result = await db.entityTag.upsert({
          where: { tagId_entityType_entityId: { tagId, entityType, entityId } },
          create: { workspaceId, tagId, entityType, entityId, appliedBy },
          update: { appliedBy },
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'tag.applied',
          entityType,
          entityId,
          metadata: { tagId, via: 'mcp' },
        });
        return result;
      },
    },
    'tag.remove': {
      description: 'Remove a tag from an entity. Args: tagId, entityType, entityId.',
      handler: async (workspaceId, args, userId) => {
        const entityType = parseEntityType(args.entityType);
        const tagId = String(args.tagId);
        const entityId = String(args.entityId);
        const res = await db.entityTag.deleteMany({ where: { workspaceId, tagId, entityType, entityId } });
        if (res.count > 0) {
          await emitEvent({
            workspaceId,
            actorId: userId,
            actorType: 'AGENT',
            action: 'tag.removed',
            entityType,
            entityId,
            metadata: { tagId, via: 'mcp' },
          });
        }
        return { removed: res.count };
      },
    },
    'tag.bulk_apply': {
      description: 'Apply one tag to many entities. Args: tagId, entityType, entityIds (string[]), optional appliedBy.',
      handler: async (workspaceId, args, userId) => {
        const entityType = parseEntityType(args.entityType);
        const tagId = String(args.tagId);
        const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId }, select: { id: true } });
        if (!tag) throw new Error('Tag not found in this workspace');
        const entityIds = (args.entityIds as string[]) ?? [];
        const appliedBy = args.appliedBy ? String(args.appliedBy) : userId;
        const res = await db.entityTag.createMany({
          data: entityIds.map((entityId) => ({ workspaceId, tagId, entityType, entityId, appliedBy })),
          skipDuplicates: true,
        });
        await emitEvent({
          workspaceId,
          actorId: userId,
          actorType: 'AGENT',
          action: 'tag.bulk_applied',
          entityType: 'TAG',
          entityId: tagId,
          metadata: { applied: res.count, entityType, via: 'mcp' },
        });
        return { applied: res.count };
      },
    },

    'ticketing.order.list': {
      description: 'List orders. Optional args: eventId, seriesId, limit (max 100).',
      handler: async (workspaceId, args) =>
        db.order.findMany({
          where: {
            workspaceId,
            ...(args.eventId ? { eventId: String(args.eventId) } : {}),
            ...(args.seriesId ? { seriesId: String(args.seriesId) } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: Math.min(Number(args.limit ?? 50), 100),
        }),
    },
    'ticketing.order.get': {
      description: 'Get one order with its RSVPs and redemptions. Args: orderId.',
      handler: async (workspaceId, args) =>
        db.order.findFirst({
          where: { id: String(args.orderId), workspaceId },
          include: { rsvps: true, redemptions: true },
        }),
    },
    'ticketing.promo.list': {
      description: 'List promo codes. Optional args: eventId, seriesId.',
      handler: async (workspaceId, args) =>
        db.promoCode.findMany({
          where: {
            workspaceId,
            ...(args.eventId ? { eventId: String(args.eventId) } : {}),
            ...(args.seriesId ? { seriesId: String(args.seriesId) } : {}),
          },
          orderBy: { createdAt: 'desc' },
        }),
    },

    'ticketing.order.create': stub('ticketing.order.create', 'Order creation ships with the Stripe payment integration.'),
    'ticketing.promo.create': stub('ticketing.promo.create', 'Promo-code management is not built yet.'),
    'ticketing.promo.redeem': stub('ticketing.promo.redeem', 'Promo redemption ships with the Stripe payment integration.'),
    'ticketing.access_token.generate': stub('ticketing.access_token.generate', 'Access-token generation is not built yet.'),
    'ticketing.access_token.revoke': stub('ticketing.access_token.revoke', 'Access-token revocation is not built yet.'),
    'ticketing.comp.issue': stub('ticketing.comp.issue', 'Comp issuance via the ticketing surface is not built yet.'),
  };
}

const NON_DESTRUCTIVE = /(^intelligence\.)|(\.list$)|(\.get$)/;

export function legacyTools(): McpTool[] {
  return [
    ...adapt(uniqueTools(), () => true),
    ...adapt(intelligenceTools(), () => false),
    ...adapt(ticketingTools(), (name) => !NON_DESTRUCTIVE.test(name)),
  ];
}
