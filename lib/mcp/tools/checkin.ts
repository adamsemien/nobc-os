import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import type { McpTool } from '../types';

const statusSchema = z.object({ eventId: z.string().describe('Event id') });

const checkInSchema = z
  .object({
    rsvpId: z.string().optional().describe('RSVP id to check in'),
    memberQrCode: z.string().optional().describe('Member QR code (requires eventId to resolve the RSVP)'),
    eventId: z.string().optional().describe('Event id — required when checking in by memberQrCode'),
  })
  .refine((v) => v.rsvpId || (v.memberQrCode && v.eventId), {
    message: 'Provide rsvpId, or both memberQrCode and eventId',
  });

export const checkinTools: McpTool[] = [
  {
    name: 'nobc_get_checkin_status',
    minRole: OperatorRole.READ_ONLY,
    description:
      'Door view for an event: confirmed RSVP count, how many have checked in, and how many remain.',
    inputSchema: statusSchema,
    handler: async (ctx, rawArgs) => {
      const args = statusSchema.parse(rawArgs);
      const event = await db.event.findFirst({
        where: { id: args.eventId, workspaceId: ctx.workspaceId },
        select: { id: true, title: true, capacity: true },
      });
      if (!event) throw new Error('Event not found or not in this workspace');

      const baseWhere = {
        workspaceId: ctx.workspaceId,
        eventId: args.eventId,
        ticketStatus: 'confirmed',
      };
      const [confirmed, checkedIn] = await Promise.all([
        db.rSVP.count({ where: baseWhere }),
        db.rSVP.count({ where: { ...baseWhere, checkedIn: true } }),
      ]);

      return {
        eventId: event.id,
        eventTitle: event.title,
        capacity: event.capacity,
        confirmedCount: confirmed,
        checkedInCount: checkedIn,
        remaining: Math.max(0, confirmed - checkedIn),
      };
    },
  },
  {
    name: 'nobc_check_in',
    description:
      'Check an attendee in at the door, by rsvpId or by memberQrCode + eventId. Idempotent — re-checking an already-checked-in RSVP is a no-op. Logs an audit event.',
    inputSchema: checkInSchema,
    destructive: true,
    handler: async (ctx, rawArgs) => {
      const args = checkInSchema.parse(rawArgs);

      const rsvp = args.rsvpId
        ? await db.rSVP.findFirst({
            where: { id: args.rsvpId, workspaceId: ctx.workspaceId },
            select: { id: true, checkedIn: true, checkedInAt: true, eventId: true },
          })
        : await db.rSVP.findFirst({
            where: {
              workspaceId: ctx.workspaceId,
              eventId: args.eventId,
              member: { memberQrCode: args.memberQrCode },
            },
            select: { id: true, checkedIn: true, checkedInAt: true, eventId: true },
          });

      if (!rsvp) throw new Error('RSVP not found or not in this workspace');
      if (rsvp.checkedIn) {
        return { rsvpId: rsvp.id, checkedIn: true, checkedInAt: rsvp.checkedInAt, alreadyCheckedIn: true };
      }

      const now = new Date();
      const updated = await db.rSVP.update({
        where: { id: rsvp.id },
        data: { checkedIn: true, checkedInAt: now },
        select: { id: true, checkedIn: true, checkedInAt: true },
      });

      await emitEvent({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        actorType: 'AGENT',
        action: 'rsvp.checked_in',
        entityType: 'RSVP',
        entityId: rsvp.id,
        metadata: { eventId: rsvp.eventId, via: 'mcp' },
      });

      return { ...updated, alreadyCheckedIn: false };
    },
  },
];
