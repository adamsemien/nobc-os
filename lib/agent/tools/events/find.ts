import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  query: z.string().optional().describe('Event title substring to match.'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
  includePast: z
    .boolean()
    .optional()
    .describe('Default false — only upcoming events. Set true to include past events.'),
  limit: z.number().int().min(1).max(20).optional(),
});
type Input = z.infer<typeof inputSchema>;

const findEvents: AgentTool<Input, unknown> = {
  name: 'events.find',
  description:
    'Search events by title and status. Upcoming-only by default; pass includePast:true to search past events too. Returns up to 20 matches.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where: Prisma.EventWhereInput = { workspaceId: ctx.workspaceId };
    if (!input.includePast) where.startAt = { gte: new Date() };
    if (input.status) where.status = input.status;
    if (input.query) where.title = { contains: input.query.trim(), mode: 'insensitive' };

    const rows = await db.event.findMany({
      where,
      take: input.limit ?? 20,
      orderBy: { startAt: input.includePast ? 'desc' : 'asc' },
      select: { id: true, title: true, startAt: true, status: true, location: true },
    });

    return {
      count: rows.length,
      events: rows.map((r) => ({
        id: r.id,
        title: r.title,
        startAt: r.startAt,
        status: r.status,
        location: r.location,
      })),
    };
  },
};

registerTool(findEvents);
export default findEvents;
