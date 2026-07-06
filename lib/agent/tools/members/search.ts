import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  query: z.string().optional().describe('Name or email substring to match.'),
  archetype: z
    .enum(['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'])
    .optional()
    .describe('Filter to members whose application archetype matches.'),
  limit: z.number().int().min(1).max(20).optional(),
});
type Input = z.infer<typeof inputSchema>;

const searchMembers: AgentTool<Input, unknown> = {
  name: 'members.search',
  description:
    'Search approved members by name, email, or archetype. Supports all three filters combined. Returns up to 20 matches.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where: Prisma.MemberWhereInput = { workspaceId: ctx.workspaceId };

    if (input.query) {
      const q = input.query.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (input.archetype) {
      const apps = await db.application.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          archetype: input.archetype,
          memberId: { not: null },
        },
        select: { memberId: true },
      });
      const ids = apps.map((a) => a.memberId!);
      where.id = { in: ids };
    }

    const rows = await db.member.findMany({
      where,
      take: input.limit ?? 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        totalEventsAttended: true,
        lastAttendedDate: true,
      },
    });

    return {
      count: rows.length,
      members: rows.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email,
        status: r.status,
        eventsAttended: r.totalEventsAttended,
        lastAttended: r.lastAttendedDate,
      })),
    };
  },
};

registerTool(searchMembers);
export default searchMembers;
