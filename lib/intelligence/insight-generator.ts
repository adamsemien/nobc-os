/** Nightly change-detection — generates the Intelligence "Insights" feed.
 *
 *  SCAFFOLD: the per-metric iteration, threshold check, and IntelligenceInsight
 *  write are wired. The Claude narrative call (MECHANICAL_MODEL tier) is
 *  stubbed — see the TODO. Runs from app/api/cron/intelligence-insights. */
import { db } from '../db';
import { listMetrics, runMetric } from './registry';
import { buildContext, DEFAULT_FILTER_STATE } from './filters';

/** A metric must move at least this much (percent) to surface as an insight. */
export const SIGNIFICANT_CHANGE_PCT = 15;

/** Placeholder narrative until the nightly Claude call is wired (next session).
 *  TODO: replace with a generateText call on the MECHANICAL_MODEL tier that
 *  writes a 2-sentence operator-facing narrative from the metric + delta. */
function placeholderNarrative(metricName: string, percent: number): string {
  const dir = percent >= 0 ? 'up' : 'down';
  return `${metricName} is ${dir} ${Math.abs(percent)}% versus the previous period. Review the metric for the drivers behind the shift.`;
}

/** Generates and persists insight cards for one workspace. Returns the count written. */
export async function generateInsights(workspaceId: string): Promise<number> {
  const ctx = buildContext(workspaceId, { ...DEFAULT_FILTER_STATE, compare: 'previous' });
  let written = 0;

  for (const metric of listMetrics()) {
    try {
      const result = await runMetric(metric.id, ctx);
      if (!result.change) continue;
      if (Math.abs(result.change.percent) < SIGNIFICANT_CHANGE_PCT) continue;

      await db.intelligenceInsight.create({
        data: {
          workspaceId,
          metricId: metric.id,
          narrative: placeholderNarrative(metric.name, result.change.percent),
          delta: result.change as object,
        },
      });
      written++;
    } catch (err) {
      console.error(`[insight-generator] metric ${metric.id} failed:`, err);
    }
  }

  return written;
}
