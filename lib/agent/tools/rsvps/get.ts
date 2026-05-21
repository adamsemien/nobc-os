import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  rsvpId: z.string().describe('RSVP id, from rsvps.list.'),
});
type Input = z.infer<typeof inputSchema>;

const getRsvp: AgentTool<Input, unknown> = {
  name: 'rsvps.get',
  description:
    'Fetch one RSVP by id with full guest detail: member, event, ticket + check-in status, comp flag, and payment state. Use after rsvps.list to inspect a specific guest.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, email: true } },
        event: { select: { id: true, title: true, slug: true, startAt: true } },
      },
    });
    if (!rsvp) return { found: false };

    return {
      found: true,
      rsvp: {
        id: rsvp.id,
        member: {
          id: rsvp.member.id,
          name: `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim(),
          email: rsvp.member.email,
        },
        event: { id: rsvp.event.id, title: rsvp.event.title, startAt: rsvp.event.startAt },
        ticketStatus: rsvp.ticketStatus,
        status: rsvp.status,
        checkedIn: rsvp.checkedIn,
        checkedInAt: rsvp.checkedInAt,
        isComp: rsvp.isComp,
        paymentStatus: rsvp.paymentStatus,
      },
    };
  },
};

registerTool(getRsvp);
export default getRsvp;
