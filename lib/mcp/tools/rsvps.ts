import { z } from 'zod';
import { OperatorRole, type RSVPStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import type { McpContext, McpTool } from '../types';

const listRsvpsSchema = z.object({
  eventId: z.string().describe('Event id to list RSVPs for'),
  limit: z.number().int().min(1).max(200).optional().describe('Max RSVPs to return (default 100)'),
  offset: z.number().int().min(0).optional(),
});

const getRsvpSchema = z.object({ rsvpId: z.string().describe('RSVP id') });

const rsvpActionSchema = z.object({
  rsvpId: z.string().describe('RSVP id'),
  reason: z.string().optional().describe('Optional reason (stored in the audit metadata)'),
});

async function transitionRsvp(
  ctx: McpContext,
  rsvpId: string,
  status: RSVPStatus,
  ticketStatus: string,
  action: string,
  reason?: string,
) {
  const rsvp = await db.rSVP.findFirst({
    where: { id: rsvpId, workspaceId: ctx.workspaceId },
    select: { id: true, ticketStatus: true, eventId: true },
  });
  if (!rsvp) throw new Error('RSVP not found or not in this workspace');

  const updated = await db.rSVP.update({
    where: { id: rsvpId },
    data: { status, ticketStatus },
  });

  await emitEvent({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    actorType: 'AGENT',
    action,
    entityType: 'RSVP',
    entityId: rsvpId,
    metadata: { previousTicketStatus: rsvp.ticketStatus, eventId: rsvp.eventId, reason: reason ?? null, via: 'mcp' },
  });

  return updated;
}

export const rsvpTools: McpTool[] = [
  {
    name: 'nobc_get_rsvps',
    minRole: OperatorRole.READ_ONLY,
    description:
      'List RSVPs (event access) for an event. Returns id, member name/email, ticketStatus, checkedIn, checkedInAt, isComp.',
    inputSchema: listRsvpsSchema,
    handler: async (ctx, rawArgs) => {
      const args = listRsvpsSchema.parse(rawArgs);
      const take = args.limit ?? 100;
      const skip = args.offset ?? 0;

      const where = { workspaceId: ctx.workspaceId, eventId: args.eventId };
      const [rsvps, total] = await Promise.all([
        db.rSVP.findMany({
          where,
          select: {
            id: true,
            ticketStatus: true,
            status: true,
            checkedIn: true,
            checkedInAt: true,
            isComp: true,
            compType: true,
            member: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        db.rSVP.count({ where }),
      ]);

      return {
        rsvps: rsvps.map((r) => ({
          id: r.id,
          memberId: r.member?.id ?? null,
          name: r.member ? `${r.member.firstName} ${r.member.lastName}`.trim() : null,
          email: r.member?.email ?? null,
          ticketStatus: r.ticketStatus,
          status: r.status,
          checkedIn: r.checkedIn,
          checkedInAt: r.checkedInAt,
          isComp: r.isComp,
          compType: r.compType,
        })),
        total,
        limit: take,
        offset: skip,
      };
    },
  },
  {
    name: 'nobc_get_rsvp',
    minRole: OperatorRole.READ_ONLY,
    description: 'Get a single RSVP with its member, event, and payment/check-in status.',
    inputSchema: getRsvpSchema,
    handler: async (ctx, rawArgs) => {
      const args = getRsvpSchema.parse(rawArgs);
      const rsvp = await db.rSVP.findFirst({
        where: { id: args.rsvpId, workspaceId: ctx.workspaceId },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, email: true } },
          event: { select: { id: true, title: true, slug: true, startAt: true } },
        },
      });
      return rsvp ?? { found: false };
    },
  },
  {
    name: 'nobc_approve_rsvp',
    description: 'Approve / confirm an RSVP (status CONFIRMED). Use for approval-gated events and waitlist promotion.',
    inputSchema: rsvpActionSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = rsvpActionSchema.parse(rawArgs);
      return transitionRsvp(ctx, args.rsvpId, 'CONFIRMED', 'confirmed', 'rsvp.confirmed', args.reason);
    },
  },
  {
    name: 'nobc_reject_rsvp',
    description: 'Reject an RSVP (status DECLINED, ticketStatus rejected). Destructive — gate behind operator confirmation.',
    inputSchema: rsvpActionSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = rsvpActionSchema.parse(rawArgs);
      return transitionRsvp(ctx, args.rsvpId, 'DECLINED', 'rejected', 'rsvp.rejected', args.reason);
    },
  },
  {
    name: 'nobc_cancel_rsvp',
    description: 'Cancel an RSVP (status DECLINED, ticketStatus cancelled), freeing a seat. Destructive — gate behind operator confirmation.',
    inputSchema: rsvpActionSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = rsvpActionSchema.parse(rawArgs);
      return transitionRsvp(ctx, args.rsvpId, 'DECLINED', 'cancelled', 'rsvp.cancelled', args.reason);
    },
  },
];
