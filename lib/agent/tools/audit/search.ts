import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  actorId: z.string().optional().describe('Clerk user id of the actor to filter by.'),
  entityType: z.string().optional().describe('Entity type, e.g. APPLICATION, EVENT, RSVP.'),
  after: z.string().datetime().optional().describe('ISO 8601 — return events after this date.'),
  before: z.string().datetime().optional().describe('ISO 8601 — return events before this date.'),
  limit: z.number().int().min(1).max(50).optional(),
});
type Input = z.infer<typeof inputSchema>;

const searchAudit: AgentTool<Input, unknown> = {
  name: 'audit.search',
  description:
    'Search the audit log by actorId, entityType, and/or date range. Use to answer "who approved X?", "what happened to this member?", or "show me activity from last week."',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where: Prisma.AuditEventWhereInput = { workspaceId: ctx.workspaceId };
    if (input.actorId) where.actorId = input.actorId;
    if (input.entityType) where.entityType = input.entityType;
    if (input.after || input.before) {
      where.createdAt = {};
      if (input.after) where.createdAt.gte = new Date(input.after);
      if (input.before) where.createdAt.lte = new Date(input.before);
    }

    const rows = await db.auditEvent.findMany({
      where,
      take: input.limit ?? 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actorId: true,
        actorType: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    return {
      count: rows.length,
      events: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorType: r.actorType,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        createdAt: r.createdAt,
      })),
    };
  },
};

registerTool(searchAudit);
export default searchAudit;
