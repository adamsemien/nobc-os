import { z } from 'zod';
import { registerTool } from '@/lib/agent/registry';
import type { AgentTool } from '@/lib/agent/types';
import '@/lib/intelligence'; // side effect: registers every metric
import { getMetric, listMetrics, runMetric } from '@/lib/intelligence/registry';

const filtersSchema = z
  .object({
    archetype: z.array(z.string()).optional(),
    tier: z.array(z.enum(['charter', 'standard', 'waitlist'])).optional(),
    source: z.array(z.string()).optional(),
    neighborhood: z.array(z.string()).optional(),
  })
  .optional();

const inputSchema = z.object({
  metricId: z.string().describe('Dotted metric id, e.g. pipeline.application-funnel.'),
  filters: filtersSchema,
});
type Input = z.infer<typeof inputSchema>;

const runMetricTool: AgentTool<Input, unknown> = {
  name: 'intelligence.run_metric',
  description:
    'Run one registered intelligence metric and return its value plus a one-line insight. If the metric id is unknown, the result lists the valid ids.',
  inputSchema,
  requiresConfirmation: false,
  auditAction: '',
  auditEntityType: '',
  handler: async (input, ctx) => {
    const metric = getMetric(input.metricId);
    if (!metric) {
      return { found: false, availableMetricIds: listMetrics().map((m) => m.id) };
    }
    const result = await runMetric(input.metricId, {
      workspaceId: ctx.workspaceId,
      filters: input.filters,
    });
    return {
      found: true,
      metricId: input.metricId,
      metric: metric.name,
      category: metric.category,
      value: result.value,
      insight: result.insight,
      format: result.format,
    };
  },
};

registerTool(runMetricTool);
export default runMetricTool;
