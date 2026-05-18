import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().describe('Max events to return. Default 10.'),
});
type Input = z.infer<typeof inputSchema>;

const listEvents: AgentTool<Input, unknown> = {
  name: 'events.list',
  description:
    'List upcoming published events in chronological order. Use when the operator asks "what events are coming up" without a specific search term.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const rows = await db.event.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: 'PUBLISHED',
        startAt: { gte: new Date() },
      },
      take: input.limit ?? 10,
      orderBy: { startAt: 'asc' },
      select: { id: true, slug: true, title: true, startAt: true, location: true, capacity: true },
    });

    return {
      count: rows.length,
      events: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        startAt: r.startAt,
        location: r.location,
        capacity: r.capacity,
      })),
    };
  },
};

registerTool(listEvents);
export default listEvents;
