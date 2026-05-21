import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  rsvpId: z.string().describe('RSVP id, from checkin.lookup or rsvps.list.'),
});
type Input = z.infer<typeof inputSchema>;
type Output =
  | { ok: true; rsvpId: string; name: string; alreadyCheckedIn: boolean; checkedInAt: Date | null }
  | { ok: false; error: string };

const checkinCheckin: AgentTool<Input, Output> = {
  name: 'checkin.checkin',
  description:
    'Check a guest in at the door by RSVP id. Idempotent — re-checking an already-checked-in guest is a safe no-op. Requires operator confirmation.',
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
    if (!rsvp) return `Check in RSVP ${input.rsvpId}?`;
    const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim();
    return `Check in ${name} for ${rsvp.event.title}?`;
  },
  auditAction: 'rsvp.checked_in',
  auditEntityType: 'RSVP',
  auditEntityId: (input) => input.rsvpId,
  handler: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        checkedIn: true,
        checkedInAt: true,
        member: { select: { firstName: true, lastName: true } },
      },
    });
    if (!rsvp) return { ok: false, error: 'not_found' };

    const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim();
    if (rsvp.checkedIn) {
      return { ok: true, rsvpId: rsvp.id, name, alreadyCheckedIn: true, checkedInAt: rsvp.checkedInAt };
    }

    const updated = await db.rSVP.update({
      where: { id: rsvp.id },
      data: { checkedIn: true, checkedInAt: new Date() },
      select: { checkedInAt: true },
    });

    return { ok: true, rsvpId: rsvp.id, name, alreadyCheckedIn: false, checkedInAt: updated.checkedInAt };
  },
};

registerTool(checkinCheckin);
export default checkinCheckin;
