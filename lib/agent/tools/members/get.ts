import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z
  .object({
    memberId: z.string().optional().describe('Member id, from members.find or members.search.'),
    email: z.string().email().optional().describe('Member email address.'),
  })
  .refine((v) => v.memberId || v.email, { message: 'Provide memberId or email.' });
type Input = z.infer<typeof inputSchema>;

const getMember: AgentTool<Input, unknown> = {
  name: 'members.get',
  description:
    'Fetch one member by id or email: profile, attendance, recent RSVPs, and how many days dormant. Use after members.find or members.search to inspect a specific member.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const where = input.memberId
      ? { id: input.memberId, workspaceId: ctx.workspaceId }
      : { email: input.email!, workspaceId: ctx.workspaceId };
    const member = await db.member.findFirst({
      where,
      include: {
        rsvps: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { event: { select: { title: true, startAt: true } } },
        },
      },
    });
    if (!member) return { found: false };

    const lastActivity = member.lastAttendedDate ?? member.rsvps[0]?.createdAt ?? null;
    const dormantDays = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000)
      : null;

    return {
      found: true,
      member: {
        id: member.id,
        name: `${member.firstName} ${member.lastName}`.trim(),
        email: member.email,
        status: member.status,
        eventsAttended: member.totalEventsAttended,
        lastAttended: member.lastAttendedDate,
        dormantDays,
        recentRsvps: member.rsvps.map((r) => ({
          event: r.event.title,
          eventDate: r.event.startAt,
          status: r.status,
          checkedIn: r.checkedIn,
        })),
      },
    };
  },
};

registerTool(getMember);
export default getMember;
