import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  eventId: z.string().describe('Event id, from events.find or events.list.'),
});
type Input = z.infer<typeof inputSchema>;

const ATTENDING = { in: ['confirmed', 'comp'] };

const checkinStatus: AgentTool<Input, unknown> = {
  name: 'checkin.status',
  description:
    'Live door status for an event: how many confirmed guests are expected, how many have checked in, how many remain, and the most recent arrivals. Use to answer "how many people are here?" or "how’s the door looking?".',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const event = await db.event.findFirst({
      where: { id: input.eventId, workspaceId: ctx.workspaceId },
      select: { id: true, title: true, capacity: true },
    });
    if (!event) return { found: false };

    const attendingWhere = {
      workspaceId: ctx.workspaceId,
      eventId: event.id,
      ticketStatus: ATTENDING,
    };

    const [expected, checkedIn, here] = await Promise.all([
      db.rSVP.count({ where: attendingWhere }),
      db.rSVP.count({ where: { ...attendingWhere, checkedIn: true } }),
      db.rSVP.findMany({
        where: { ...attendingWhere, checkedIn: true },
        take: 25,
        orderBy: { checkedInAt: 'desc' },
        select: { checkedInAt: true, member: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    return {
      found: true,
      event: event.title,
      capacity: event.capacity,
      expected,
      checkedIn,
      remaining: Math.max(0, expected - checkedIn),
      here: here.map((r) => ({
        name: `${r.member.firstName} ${r.member.lastName}`.trim(),
        at: r.checkedInAt,
      })),
    };
  },
};

registerTool(checkinStatus);
export default checkinStatus;
