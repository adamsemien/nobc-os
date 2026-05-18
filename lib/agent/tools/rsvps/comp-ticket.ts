import { z } from 'zod';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  memberId: z.string().describe('Member id, from members.find.'),
  eventId: z.string().describe('Event id, from events.find.'),
  note: z.string().max(500).optional(),
});
type Input = z.infer<typeof inputSchema>;

type CompOutput =
  | { ok: true; rsvpId: string; member: string; event: string }
  | { ok: false; error: string };

// One comp ticket per call — RSVP is unique per (workspace, event, member).
// Call once per recipient; multi-recipient batching is a Phase 2 item.
const compTicket: AgentTool<Input, CompOutput> = {
  name: 'rsvps.comp_ticket',
  description:
    'Comp a single ticket for a member to an event — no charge, no Stripe. Sends the ticket confirmation email with a QR code. Requires operator confirmation. Call once per recipient.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const member = await db.member.findFirst({
      where: { id: input.memberId, workspaceId: ctx.workspaceId },
      select: { firstName: true, lastName: true },
    });
    const event = await db.event.findFirst({
      where: { id: input.eventId, workspaceId: ctx.workspaceId },
      select: { title: true, startAt: true },
    });
    const name = member ? `${member.firstName} ${member.lastName}`.trim() : input.memberId;
    if (!event) return `Comp a ticket for ${name}?`;
    const date = event.startAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `Comp a ticket for ${name} to ${event.title} on ${date}? No charge, no Stripe.`;
  },
  auditAction: 'rsvp.comped',
  auditEntityType: 'RSVP',
  auditEntityId: (_input, output) => (output?.ok ? output.rsvpId : '-'),
  handler: async (input, ctx) => {
    const member = await db.member.findFirst({
      where: { id: input.memberId, workspaceId: ctx.workspaceId },
    });
    if (!member) return { ok: false, error: 'member_not_found' };

    const event = await db.event.findFirst({
      where: { id: input.eventId, workspaceId: ctx.workspaceId },
      select: { id: true, title: true, startAt: true, location: true },
    });
    if (!event) return { ok: false, error: 'event_not_found' };

    const existing = await db.rSVP.findFirst({
      where: { workspaceId: ctx.workspaceId, eventId: event.id, memberId: member.id },
      select: { id: true },
    });
    if (existing) return { ok: false, error: 'already_registered' };

    let qr = member.memberQrCode;
    if (!qr) {
      qr = `nobc_${randomUUID()}`;
      await db.member.update({ where: { id: member.id }, data: { memberQrCode: qr } });
    }

    const rsvp = await db.rSVP.create({
      data: {
        workspaceId: ctx.workspaceId,
        eventId: event.id,
        memberId: member.id,
        status: 'CONFIRMED',
        ticketStatus: 'confirmed',
        origin: 'comp',
        isComp: true,
        compType: 'Other',
      },
    });

    if (process.env.RESEND_API_KEY) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 1 });
        const { resend } = await import('@/lib/resend');
        const { compTicketEmail } = await import('@/lib/email-templates');
        await resend.emails.send({
          from: 'NoBC <team@thenobadcompany.com>',
          to: member.email,
          ...compTicketEmail(
            `${member.firstName} ${member.lastName}`.trim(),
            event.title,
            event.startAt,
            event.location,
            rsvp.id,
            qrDataUrl,
          ),
        });
      } catch (e) {
        console.error('[agent comp-ticket] email failed:', e);
      }
    }

    return {
      ok: true,
      rsvpId: rsvp.id,
      member: `${member.firstName} ${member.lastName}`.trim(),
      event: event.title,
    };
  },
};

registerTool(compTicket);
export default compTicket;
