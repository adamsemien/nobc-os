import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  rsvpId: z.string().describe('RSVP id, from rsvps.list (must be pending approval).'),
});
type Input = z.infer<typeof inputSchema>;
type Output = { ok: true; rsvpId: string; name: string } | { ok: false; error: string };

const approveRsvp: AgentTool<Input, Output> = {
  name: 'rsvps.approve',
  description:
    'Approve a pending-approval RSVP (event access request), confirming the guest’s spot. Only works on RSVPs whose ticket status is pending_approval. Requires operator confirmation.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      select: {
        member: { select: { firstName: true, lastName: true } },
        event: { select: { title: true } },
      },
    });
    if (!rsvp) return `Approve RSVP ${input.rsvpId}?`;
    const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim();
    return `Approve ${name}'s access request for ${rsvp.event.title}? Confirms their spot.`;
  },
  auditAction: 'rsvp.approved',
  auditEntityType: 'RSVP',
  auditEntityId: (input) => input.rsvpId,
  handler: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        ticketStatus: true,
        eventId: true,
        member: { select: { firstName: true, lastName: true } },
        event: { select: { capacity: true } },
      },
    });
    if (!rsvp) return { ok: false, error: 'not_found' };
    if (rsvp.ticketStatus !== 'pending_approval') return { ok: false, error: 'not_pending_approval' };

    if (rsvp.event.capacity != null) {
      const taken = await db.rSVP.count({
        where: {
          workspaceId: ctx.workspaceId,
          eventId: rsvp.eventId,
          ticketStatus: { in: ['confirmed', 'held'] },
        },
      });
      if (taken >= rsvp.event.capacity) return { ok: false, error: 'at_capacity' };
    }

    await db.rSVP.update({
      where: { id: rsvp.id },
      data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
    });

    return { ok: true, rsvpId: rsvp.id, name: `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim() };
  },
};

registerTool(approveRsvp);
export default approveRsvp;
