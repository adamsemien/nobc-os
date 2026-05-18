import { z } from 'zod';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';
import '@/lib/intelligence'; // side effect: registers every metric
import { composeInsight } from '@/lib/intelligence/composer';

const filtersSchema = z
  .object({
    archetype: z.array(z.string()).optional(),
    tier: z.array(z.enum(['charter', 'standard', 'waitlist'])).optional(),
    source: z.array(z.string()).optional(),
    neighborhood: z.array(z.string()).optional(),
  })
  .optional();

const inputSchema = z.object({
  question: z.string().describe('A natural-language analytics question about the community.'),
  filters: filtersSchema,
});
type Input = z.infer<typeof inputSchema>;

const composeInsightTool: AgentTool<Input, unknown> = {
  name: 'intelligence.compose',
  description:
    'Answer an open analytics question. Selects 2–4 registered metrics, runs them, and returns a synthesized narrative. Use for broad "what/why/where" questions about the community, pipeline, or sponsors.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const composition = await composeInsight(input.question, {
      workspaceId: ctx.workspaceId,
      filters: input.filters,
    });
    return {
      narrative: composition.narrative,
      metricIds: composition.metricIds,
      tiles: composition.tiles.map((t) => ({
        metric: t.meta.name,
        value: t.result.value,
        insight: t.result.insight,
      })),
    };
  },
};

registerTool(composeInsightTool);
export default composeInsightTool;
