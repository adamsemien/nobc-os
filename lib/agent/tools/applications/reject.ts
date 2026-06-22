import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  applicationId: z.string().describe('Application id, from applications.find.'),
  reason: z.string().max(4000).optional().describe('Optional internal rejection reason.'),
});
type Input = z.infer<typeof inputSchema>;

const rejectApplication: AgentTool<Input, unknown> = {
  name: 'applications.reject',
  description:
    'Reject a membership application. Sends the decline email. Requires operator confirmation.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
      select: { fullName: true },
    });
    return `Reject ${app?.fullName ?? input.applicationId}? Sends the decline email and they cannot reapply for 6 months.`;
  },
  auditAction: 'application.rejected',
  auditEntityType: 'APPLICATION',
  auditEntityId: (input) => input.applicationId,
  handler: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
    });
    if (!app) return { ok: false, error: 'not_found' };

    await db.application.update({
      where: { id: app.id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: ctx.operatorId,
        rejectionReason: input.reason ?? null,
      },
    });

    if (process.env.RESEND_API_KEY) {
      const { applicationRejectedEmail } = await import('@/lib/email-templates');
      const { resend } = await import('@/lib/resend');
      const { subject, html } = applicationRejectedEmail(app.fullName);
      resend.emails
        .send({ from: 'The No Bad Company <team@thenobadcompany.com>', to: app.email, subject, html })
        .catch((e) => console.error('[agent reject] email failed:', e));
    }

    return { ok: true, applicationId: app.id, name: app.fullName };
  },
};

registerTool(rejectApplication);
export default rejectApplication;
