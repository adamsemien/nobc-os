import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  rsvpId: z.string().describe('RSVP id, from rsvps.list (must be pending approval).'),
});
type Input = z.infer<typeof inputSchema>;
type Output = { ok: true; rsvpId: string; name: string } | { ok: false; error: string };

const rejectRsvp: AgentTool<Input, Output> = {
  name: 'rsvps.reject',
  description:
    'Reject a pending-approval RSVP (event access request), declining the guest. Only works on RSVPs whose ticket status is pending_approval. Requires operator confirmation.',
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
    if (!rsvp) return `Reject RSVP ${input.rsvpId}?`;
    const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim();
    return `Reject ${name}'s access request for ${rsvp.event.title}? They will not be admitted.`;
  },
  auditAction: 'rsvp.rejected',
  auditEntityType: 'RSVP',
  auditEntityId: (input) => input.rsvpId,
  handler: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        ticketStatus: true,
        member: { select: { firstName: true, lastName: true } },
      },
    });
    if (!rsvp) return { ok: false, error: 'not_found' };
    if (rsvp.ticketStatus !== 'pending_approval') return { ok: false, error: 'not_pending_approval' };

    await db.rSVP.update({
      where: { id: rsvp.id },
      data: { ticketStatus: 'rejected', status: 'DECLINED' },
    });

    return { ok: true, rsvpId: rsvp.id, name: `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim() };
  },
};

registerTool(rejectRsvp);
export default rejectRsvp;
