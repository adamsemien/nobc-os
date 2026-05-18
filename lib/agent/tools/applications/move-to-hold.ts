import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  applicationId: z.string().describe('Application id, from applications.find.'),
});
type Input = z.infer<typeof inputSchema>;

// No confirmation: internal-only, reversible, no member-facing side effect.
const moveToHold: AgentTool<Input, unknown> = {
  name: 'applications.move_to_hold',
  description:
    'Put a membership application on hold for later review. Internal only — no email is sent. Reversible.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: 'application.held',
  auditEntityType: 'APPLICATION',
  auditEntityId: (input) => input.applicationId,
  handler: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
    });
    if (!app) return { ok: false, error: 'not_found' };

    await db.application.update({
      where: { id: app.id },
      data: { status: 'HOLD', reviewedAt: new Date(), reviewedBy: ctx.operatorId },
    });

    return { ok: true, applicationId: app.id, name: app.fullName };
  },
};

registerTool(moveToHold);
export default moveToHold;
