import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const TICKET_STATUSES = [
  'confirmed',
  'pending_approval',
  'waitlisted',
  'rejected',
  'cancelled',
  'comp',
  'all',
] as const;

const inputSchema = z.object({
  eventId: z.string().describe('Event id, from events.find or events.list.'),
  status: z
    .enum(TICKET_STATUSES)
    .optional()
    .describe('Filter by ticket status. Default "all".'),
  search: z.string().optional().describe('Case-insensitive match on guest name or email.'),
  limit: z.number().int().min(1).max(100).optional().describe('Max RSVPs to return. Default 50.'),
});
type Input = z.infer<typeof inputSchema>;

const listRsvps: AgentTool<Input, unknown> = {
  name: 'rsvps.list',
  description:
    'List the guest list (RSVPs / event access) for an event. Filter by ticket status and/or search by guest name or email. Use to answer "who is coming to X?", "how many are confirmed?", or "is anyone on the waitlist?".',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const event = await db.event.findFirst({
      where: { id: input.eventId, workspaceId: ctx.workspaceId },
      select: { id: true, title: true },
    });
    if (!event) return { found: false };

    const where: Prisma.RSVPWhereInput = { workspaceId: ctx.workspaceId, eventId: event.id };
    const status = input.status ?? 'all';
    if (status !== 'all') where.ticketStatus = status;
    if (input.search?.trim()) {
      const q = input.search.trim();
      where.member = {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const rows = await db.rSVP.findMany({
      where,
      take: input.limit ?? 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketStatus: true,
        status: true,
        checkedIn: true,
        checkedInAt: true,
        isComp: true,
        member: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return {
      found: true,
      event: event.title,
      count: rows.length,
      rsvps: rows.map((r) => ({
        rsvpId: r.id,
        name: `${r.member.firstName} ${r.member.lastName}`.trim(),
        email: r.member.email,
        ticketStatus: r.ticketStatus,
        status: r.status,
        checkedIn: r.checkedIn,
        checkedInAt: r.checkedInAt,
        isComp: r.isComp,
      })),
    };
  },
};

registerTool(listRsvps);
export default listRsvps;
