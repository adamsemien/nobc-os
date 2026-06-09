import { z } from 'zod';
import { EventAccessMode, OperatorRole, type EventStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import type { McpTool } from '../types';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event'
  );
}

const getEventsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().describe('Max events to return (default 50)'),
  offset: z.number().int().min(0).optional().describe('Number to skip (pagination)'),
  status: z.enum(['PUBLISHED', 'DRAFT', 'CANCELLED', 'all']).optional().describe('Filter by status (default all)'),
  upcoming: z.boolean().optional().describe('When true, only events starting now or later'),
});

const getEventSchema = z.object({ id: z.string().describe('Event id') });

const createEventSchema = z.object({
  title: z.string().describe('Event title'),
  slug: z.string().optional().describe('URL slug (auto-derived from title if omitted)'),
  startAt: z.string().optional().describe('ISO datetime the event starts'),
  endAt: z.string().optional().describe('ISO datetime the event ends'),
  location: z.string().optional(),
  description: z.string().optional(),
  capacity: z.number().int().min(0).optional(),
});

const updateEventSchema = z.object({
  id: z.string().describe('Event id (must be a DRAFT)'),
  title: z.string().optional(),
  description: z.string().optional(),
  startAt: z.string().optional().describe('ISO datetime'),
  endAt: z.string().optional().describe('ISO datetime'),
  location: z.string().optional(),
  capacity: z.number().int().min(0).optional(),
  accessMode: z.enum(['OPEN', 'TICKETED']).optional(),
  approvalRequired: z.boolean().optional(),
  plusOnesAllowed: z.boolean().optional(),
});

const eventIdSchema = z.object({ eventId: z.string().describe('Event id') });

export const eventTools: McpTool[] = [
  {
    name: 'nobc_get_events',
    minRole: OperatorRole.READ_ONLY,
    description:
      'List events. Filter by status (PUBLISHED | DRAFT | CANCELLED | all) and upcoming (boolean). Returns id, name, slug, date, accessMode, capacity, confirmedCount.',
    inputSchema: getEventsSchema,
    handler: async (ctx, rawArgs) => {
      const args = getEventsSchema.parse(rawArgs);
      const take = args.limit ?? 50;
      const skip = args.offset ?? 0;

      const where: Prisma.EventWhereInput = { workspaceId: ctx.workspaceId };
      if (args.status && args.status !== 'all') where.status = args.status as EventStatus;
      if (args.upcoming) where.startAt = { gte: new Date() };

      const [events, total] = await Promise.all([
        db.event.findMany({
          where,
          select: {
            id: true,
            title: true,
            slug: true,
            startAt: true,
            accessMode: true,
            capacity: true,
            status: true,
            _count: { select: { rsvps: true } },
          },
          orderBy: { startAt: 'asc' },
          take,
          skip,
        }),
        db.event.count({ where }),
      ]);

      return {
        events: events.map((e) => ({
          id: e.id,
          name: e.title,
          slug: e.slug,
          date: e.startAt,
          accessMode: e.accessMode,
          capacity: e.capacity,
          status: e.status,
          confirmedCount: e._count.rsvps,
        })),
        total,
        limit: take,
        offset: skip,
      };
    },
  },
  {
    name: 'nobc_get_event',
    minRole: OperatorRole.READ_ONLY,
    description: 'Get a single event by id, including its confirmed RSVP count.',
    inputSchema: getEventSchema,
    handler: async (ctx, rawArgs) => {
      const args = getEventSchema.parse(rawArgs);
      const event = await db.event.findFirst({
        where: { id: args.id, workspaceId: ctx.workspaceId },
        include: { _count: { select: { rsvps: true } } },
      });
      return event ?? { found: false };
    },
  },
  {
    name: 'nobc_create_event',
    description: 'Create a new DRAFT event. Args: title (required), optional slug, startAt, endAt, location, description, capacity.',
    inputSchema: createEventSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = createEventSchema.parse(rawArgs);
      const event = await db.event.create({
        data: {
          workspaceId: ctx.workspaceId,
          title: args.title,
          slug: args.slug ? slugify(args.slug) : slugify(args.title),
          startAt: args.startAt ? new Date(args.startAt) : new Date(),
          endAt: args.endAt ? new Date(args.endAt) : null,
          location: args.location ?? null,
          description: args.description ?? null,
          capacity: args.capacity ?? null,
          status: 'DRAFT',
        },
      });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'event.created',
        entityType: 'EVENT',
        entityId: event.id,
        metadata: { title: args.title, via: 'mcp' },
      });

      return event;
    },
  },
  {
    name: 'nobc_update_event',
    description: 'Update a DRAFT event (only DRAFT events are editable). Pass id plus any fields to change.',
    inputSchema: updateEventSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = updateEventSchema.parse(rawArgs);
      const existing = await db.event.findFirst({
        where: { id: args.id, workspaceId: ctx.workspaceId },
        select: { status: true },
      });
      if (!existing) throw new Error('Event not found or not in this workspace');
      if (existing.status !== 'DRAFT') {
        throw new Error(`Only DRAFT events can be updated (current status: ${existing.status})`);
      }

      const data: Prisma.EventUpdateInput = {};
      if (args.title !== undefined) data.title = args.title;
      if (args.description !== undefined) data.description = args.description;
      if (args.startAt !== undefined) data.startAt = new Date(args.startAt);
      if (args.endAt !== undefined) data.endAt = new Date(args.endAt);
      if (args.location !== undefined) data.location = args.location;
      if (args.capacity !== undefined) data.capacity = args.capacity;
      if (args.accessMode !== undefined) data.accessMode = args.accessMode as EventAccessMode;
      if (args.approvalRequired !== undefined) data.approvalRequired = args.approvalRequired;
      if (args.plusOnesAllowed !== undefined) data.plusOnesAllowed = args.plusOnesAllowed;

      const updated = await db.event.update({ where: { id: args.id }, data });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'event.updated',
        entityType: 'EVENT',
        entityId: args.id,
        metadata: { fields: Object.keys(data).join(','), via: 'mcp' },
      });

      return updated;
    },
  },
  {
    name: 'nobc_publish_event',
    description: 'Publish an event (status → PUBLISHED), making it visible to members.',
    inputSchema: eventIdSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = eventIdSchema.parse(rawArgs);
      const existing = await db.event.findFirst({
        where: { id: args.eventId, workspaceId: ctx.workspaceId },
        select: { status: true },
      });
      if (!existing) throw new Error('Event not found or not in this workspace');

      const updated = await db.event.update({
        where: { id: args.eventId },
        data: { status: 'PUBLISHED' },
      });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'event.published',
        entityType: 'EVENT',
        entityId: args.eventId,
        metadata: { previousStatus: existing.status, via: 'mcp' },
      });

      return updated;
    },
  },
  {
    name: 'nobc_cancel_event',
    description: 'Cancel an event (status → CANCELLED). Destructive — gate behind operator confirmation.',
    inputSchema: eventIdSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = eventIdSchema.parse(rawArgs);
      const existing = await db.event.findFirst({
        where: { id: args.eventId, workspaceId: ctx.workspaceId },
        select: { status: true },
      });
      if (!existing) throw new Error('Event not found or not in this workspace');

      const updated = await db.event.update({
        where: { id: args.eventId },
        data: { status: 'CANCELLED' },
      });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'event.cancelled',
        entityType: 'EVENT',
        entityId: args.eventId,
        metadata: { previousStatus: existing.status, via: 'mcp' },
      });

      return updated;
    },
  },
];
