import { z } from 'zod';
import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  rsvpId: z.string().describe('RSVP id of a waitlisted guest, from rsvps.list.'),
});
type Input = z.infer<typeof inputSchema>;
type Output = { ok: true; rsvpId: string; name: string } | { ok: false; error: string };

const promoteRsvp: AgentTool<Input, Output> = {
  name: 'rsvps.promote',
  description:
    'Promote a waitlisted RSVP to confirmed, freeing them from the waitlist into the guest list. Only works on waitlisted RSVPs. Requires operator confirmation.',
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
    if (!rsvp) return `Promote RSVP ${input.rsvpId} from the waitlist?`;
    const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim();
    return `Promote ${name} from the waitlist for ${rsvp.event.title}? Confirms their spot.`;
  },
  auditAction: 'rsvp.confirmed',
  auditEntityType: 'RSVP',
  auditEntityId: (input) => input.rsvpId,
  handler: async (input, ctx) => {
    const rsvp = await db.rSVP.findFirst({
      where: { id: input.rsvpId, workspaceId: ctx.workspaceId },
      select: {
        id: true,
        status: true,
        ticketStatus: true,
        eventId: true,
        memberId: true,
        member: { select: { firstName: true, lastName: true, personId: true } },
      },
    });
    if (!rsvp) return { ok: false, error: 'not_found' };
    if (rsvp.status !== 'WAITLISTED' && rsvp.ticketStatus !== 'waitlisted') {
      return { ok: false, error: 'not_waitlisted' };
    }

    await db.rSVP.update({
      where: { id: rsvp.id },
      data: { status: 'CONFIRMED', ticketStatus: 'confirmed' },
    });

    // Ways-In Phase A (spec §4): the promotion lands on the member's
    // timeline. Exactly once: the not_waitlisted guard above blocks a
    // second promote of the same RSVP. Fire-and-forget.
    void logEngagementEvent({
      workspaceId: ctx.workspaceId,
      memberId: rsvp.memberId,
      personId: rsvp.member.personId,
      eventType: 'waitlist_promoted',
      eventId: rsvp.eventId,
      metadata: { rsvpId: rsvp.id, via: 'agent_tool' },
    });

    return { ok: true, rsvpId: rsvp.id, name: `${rsvp.member.firstName} ${rsvp.member.lastName}`.trim() };
  },
};

registerTool(promoteRsvp);
export default promoteRsvp;
