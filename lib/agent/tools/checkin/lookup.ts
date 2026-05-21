import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  eventId: z.string().describe('Event id, from events.find or events.list.'),
  query: z.string().min(1).describe('Guest name or email to look up at the door.'),
});
type Input = z.infer<typeof inputSchema>;

const checkinLookup: AgentTool<Input, unknown> = {
  name: 'checkin.lookup',
  description:
    'Look up a specific guest at an event by name or email and report whether they are checked in. Returns each match with its rsvpId so you can then call checkin.checkin. Use to answer "is Priya here yet?".',
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

    const q = input.query.trim();
    const rows = await db.rSVP.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        eventId: event.id,
        member: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketStatus: true,
        checkedIn: true,
        checkedInAt: true,
        member: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return {
      found: true,
      event: event.title,
      count: rows.length,
      matches: rows.map((r) => ({
        rsvpId: r.id,
        name: `${r.member.firstName} ${r.member.lastName}`.trim(),
        email: r.member.email,
        ticketStatus: r.ticketStatus,
        checkedIn: r.checkedIn,
        checkedInAt: r.checkedInAt,
      })),
    };
  },
};

registerTool(checkinLookup);
export default checkinLookup;
