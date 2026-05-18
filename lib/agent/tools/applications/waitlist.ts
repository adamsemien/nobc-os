import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  applicationId: z.string().describe('Application id, from applications.find.'),
});
type Input = z.infer<typeof inputSchema>;

const waitlistApplication: AgentTool<Input, unknown> = {
  name: 'applications.waitlist',
  description:
    'Move a membership application to the waitlist. Sends the waitlist email. Requires operator confirmation.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
      select: { fullName: true },
    });
    return `Move ${app?.fullName ?? input.applicationId} to waitlist? Sends the waitlist email.`;
  },
  auditAction: 'application.waitlisted',
  auditEntityType: 'APPLICATION',
  auditEntityId: (input) => input.applicationId,
  handler: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
    });
    if (!app) return { ok: false, error: 'not_found' };

    await db.application.update({
      where: { id: app.id },
      data: { status: 'WAITLISTED', reviewedAt: new Date(), reviewedBy: ctx.operatorId },
    });

    if (process.env.RESEND_API_KEY) {
      const { render } = await import('@react-email/render');
      const WaitlistEmail = (await import('@/emails/WaitlistEmail')).default;
      const { resend } = await import('@/lib/resend');
      const html = await render(WaitlistEmail({ name: app.fullName }));
      resend.emails
        .send({
          from: 'The No Bad Company <team@thenobadcompany.com>',
          to: app.email,
          subject: 'your application — no bad company.',
          html,
        })
        .catch((e) => console.error('[agent waitlist] email failed:', e));
    }

    return { ok: true, applicationId: app.id, name: app.fullName };
  },
};

registerTool(waitlistApplication);
export default waitlistApplication;
