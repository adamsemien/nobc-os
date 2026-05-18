import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

// Canonical aiScore is 0–1 (scoring.ts output); /30 is display-only.
const CHARTER_MIN = 22 / 30; // 0.733
const STANDARD_MIN = 16 / 30; // 0.533

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('Name, email, city, or neighbourhood substring to match.'),
  status: z
    .enum(['PENDING', 'APPROVED', 'REJECTED', 'HOLD', 'WAITLISTED', 'DECLINED'])
    .optional(),
  archetype: z.string().optional().describe('Exact archetype name, e.g. Connector, Host.'),
  tier: z
    .enum(['charter', 'standard', 'waitlist'])
    .optional()
    .describe('Derived from AI member-worth score (0–1): charter ≥0.73, standard 0.53–0.73, waitlist <0.53.'),
  limit: z.number().int().min(1).max(20).optional(),
});
type Input = z.infer<typeof inputSchema>;

const findApplications: AgentTool<Input, unknown> = {
  name: 'applications.find',
  description:
    'Search membership applications by name, email, city/neighbourhood, status, archetype, or tier. Returns up to 20 matches. Use this to locate applications before acting on one.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where: Prisma.ApplicationWhereInput = { workspaceId: ctx.workspaceId };
    if (input.status) where.status = input.status;
    if (input.archetype) where.archetype = { equals: input.archetype, mode: 'insensitive' };
    if (input.tier === 'charter') where.aiScore = { gte: CHARTER_MIN };
    else if (input.tier === 'standard') where.aiScore = { gte: STANDARD_MIN, lt: CHARTER_MIN };
    else if (input.tier === 'waitlist')
      where.OR = [{ aiScore: { lt: STANDARD_MIN } }, { aiScore: null }];
    if (input.query) {
      const q = input.query.trim();
      where.AND = [
        {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { neighborhood: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const rows = await db.application.findMany({
      where,
      take: input.limit ?? 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        archetype: true,
        aiScore: true,
        neighborhood: true,
      },
    });

    return {
      count: rows.length,
      applications: rows.map((r) => ({
        id: r.id,
        name: r.fullName,
        email: r.email,
        status: r.status,
        archetype: r.archetype,
        memberWorth: r.aiScore,
        neighborhood: r.neighborhood,
      })),
    };
  },
};

registerTool(findApplications);
export default findApplications;
