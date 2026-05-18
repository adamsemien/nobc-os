import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import { approveApplication } from '@/lib/applications/approve';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  applicationId: z.string().describe('Application id, from applications.find.'),
  reviewNote: z.string().max(4000).optional().describe('Optional internal note.'),
});
type Input = z.infer<typeof inputSchema>;

const approveApplicationTool: AgentTool<Input, unknown> = {
  name: 'applications.approve',
  description:
    'Approve a membership application. Creates the Member record and sends the welcome email. Requires operator confirmation.',
  inputSchema,
  requiresConfirmation: true,
  confirmationPrompt: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
      select: { fullName: true, archetype: true, aiScore: true },
    });
    if (!app) return `Approve application ${input.applicationId}?`;
    // aiScore is canonical 0–1 — show it as a percentage.
    const worth = app.aiScore != null ? `${Math.round(app.aiScore * 100)}%` : 'unscored';
    return `Approve ${app.fullName} (${app.archetype ?? 'no archetype'}, member worth ${worth})? This creates their Member record and sends the welcome email.`;
  },
  // approveApplication() emits its own audit events — no double-audit here.
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const outcome = await approveApplication({
      applicationId: input.applicationId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.operatorId,
      actorType: 'AGENT',
      reviewNote: input.reviewNote,
    });
    if (!outcome.ok) return { ok: false, error: outcome.error };
    return { ok: true, memberId: outcome.member.id, name: outcome.application.fullName };
  },
};

registerTool(approveApplicationTool);
export default approveApplicationTool;
