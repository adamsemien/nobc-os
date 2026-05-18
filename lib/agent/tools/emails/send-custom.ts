import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  recipientType: z
    .enum(['member', 'application'])
    .describe('Whether the recipient is an existing member or applicant.'),
  recipientId: z.string().describe('Member id or Application id — the email is read from it.'),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000).describe('Plain-text body. Sent from team@thenobadcompany.com.'),
});
type Input = z.infer<typeof inputSchema>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function resolveRecipient(input: Input, workspaceId: string) {
  if (input.recipientType === 'member') {
    const m = await db.member.findFirst({
      where: { id: input.recipientId, workspaceId },
      select: { email: true, firstName: true, lastName: true },
    });
    return m ? { email: m.email, name: `${m.firstName} ${m.lastName}`.trim() } : null;
  }
  const a = await db.application.findFirst({
    where: { id: input.recipientId, workspaceId },
    select: { email: true, fullName: true },
  });
  return a ? { email: a.email, name: a.fullName } : null;
}

const sendCustomEmail: AgentTool<Input, unknown> = {
  name: 'emails.send_custom',
  description:
    'Send a custom plain-text email to an existing member or applicant. The From address is locked to team@thenobadcompany.com. Requires operator confirmation — they approve the exact content.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const recipient = await resolveRecipient(input, ctx.workspaceId);
    if (!recipient) return `Recipient ${input.recipientId} not found in this workspace.`;
    return `Send this email?\n\nFrom: team@thenobadcompany.com\nTo: ${recipient.name} <${recipient.email}>\nSubject: ${input.subject}\n\n${input.body}`;
  },
  auditAction: 'email.sent_custom',
  auditEntityType: 'EMAIL',
  auditEntityId: (input) => input.recipientId,
  handler: async (input, ctx) => {
    const recipient = await resolveRecipient(input, ctx.workspaceId);
    if (!recipient) return { ok: false, error: 'recipient_not_found' };
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'service unavailable' };
    try {
      const { resend } = await import('@/lib/resend');
      await resend.emails.send({
        from: 'NoBC <team@thenobadcompany.com>',
        to: recipient.email,
        subject: input.subject,
        html: `<div style="font-family:sans-serif;white-space:pre-wrap;font-size:15px;line-height:1.6">${escapeHtml(
          input.body,
        )}</div>`,
      });
      return { ok: true, to: recipient.email };
    } catch (e) {
      console.error('[agent send-custom] failed:', e);
      return { ok: false, error: 'service unavailable' };
    }
  },
};

registerTool(sendCustomEmail);
export default sendCustomEmail;
