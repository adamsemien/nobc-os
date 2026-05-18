import { z } from 'zod';
import { db } from '@/lib/db';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';

const inputSchema = z.object({
  applicationId: z.string().describe('Application id, from applications.find.'),
});
type Input = z.infer<typeof inputSchema>;

const getApplication: AgentTool<Input, unknown> = {
  name: 'applications.get',
  description:
    'Fetch one full application by id: profile, status, AI scoring, archetype, and every answer with its human-readable question label. Use after applications.find to inspect a specific applicant.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const app = await db.application.findFirst({
      where: { id: input.applicationId, workspaceId: ctx.workspaceId },
      include: { answers: true },
    });
    if (!app) return { found: false };

    const defs = await db.questionDefinition.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { stableKey: true, insightLabel: true },
    });
    const labels = new Map(defs.map((d) => [d.stableKey, d.insightLabel]));

    return {
      found: true,
      application: {
        id: app.id,
        name: app.fullName,
        email: app.email,
        phone: app.phone,
        city: app.city,
        neighborhood: app.neighborhood,
        status: app.status,
        archetype: app.archetype,
        archetypeScores: app.archetypeScores,
        memberWorth: app.aiScore,
        aiRecommendation: app.aiRecommendation,
        aiReasoning: app.aiReasoning,
        aiTags: app.aiTags,
        personalizedCopy: app.personalizedCopy,
        answers: app.answers.map((a) => ({
          question: labels.get(a.questionKey) ?? a.questionKey,
          answer: a.answer,
        })),
      },
    };
  },
};

registerTool(getApplication);
export default getApplication;
