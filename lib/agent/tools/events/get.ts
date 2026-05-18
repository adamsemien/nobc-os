import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z
  .object({
    eventId: z.string().optional().describe('Event id, from events.find or events.list.'),
    slug: z.string().optional().describe('Event URL slug.'),
  })
  .refine((v) => v.eventId || v.slug, { message: 'Provide eventId or slug.' });
type Input = z.infer<typeof inputSchema>;

const getEvent: AgentTool<Input, unknown> = {
  name: 'events.get',
  description:
    'Fetch one event by id or slug with its registration counts grouped by RSVP status. Use after events.find or events.list to inspect a specific event.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where = input.eventId
      ? { id: input.eventId, workspaceId: ctx.workspaceId }
      : { slug: input.slug!, workspaceId: ctx.workspaceId };
    const event = await db.event.findFirst({ where });
    if (!event) return { found: false };

    const grouped = await db.rSVP.groupBy({
      by: ['status'],
      where: { workspaceId: ctx.workspaceId, eventId: event.id },
      _count: true,
    });
    const rsvpCounts: Record<string, number> = {};
    for (const g of grouped) rsvpCounts[g.status] = g._count;

    return {
      found: true,
      event: {
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        status: event.status,
        location: event.location,
        capacity: event.capacity,
        accessMode: event.accessMode,
        rsvpCounts,
      },
    };
  },
};

registerTool(getEvent);
export default getEvent;
