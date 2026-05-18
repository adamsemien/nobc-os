/** AI Insight Composer — natural-language → custom dashboard.
 *
 *  Two Claude calls (claude-sonnet-4-20250514):
 *   1. selection — given the metric catalog + the question, pick 2-4 metrics
 *   2. synthesis — given the question + metric results, write the narrative
 *
 *  Claude can ONLY choose from the registered catalog — selections are
 *  validated against the registry, so it cannot invent a metric. */
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getMetric, listMetrics, runMetric } from './registry';
import { toMetricMeta, type MetricContext, type MetricMeta, type MetricResult } from './types';

const MODEL = 'claude-sonnet-4-20250514';
const CACHE_TTL_MS = 10 * 60_000;

export type ComposedTile = { meta: MetricMeta; result: MetricResult };

export type Composition = {
  compositionId: string;
  narrative: string;
  metricIds: string[];
  tiles: ComposedTile[];
};

const cache = new Map<string, { at: number; composition: Composition }>();

function compositionId(workspaceId: string, question: string, ctx: MetricContext): string {
  const payload = JSON.stringify({
    workspaceId,
    question: question.trim().toLowerCase(),
    range: ctx.dateRange && { f: +ctx.dateRange.from, t: +ctx.dateRange.to },
    filters: ctx.filters ?? null,
    demo: ctx.demoMode ?? false,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

const SelectionSchema = z.object({
  metricIds: z.array(z.string()).describe('2-4 metric ids copied exactly from the catalog'),
  reasoning: z.string(),
});

export async function composeInsight(question: string, ctx: MetricContext): Promise<Composition> {
  const id = compositionId(ctx.workspaceId, question, ctx);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.composition;

  const metrics = listMetrics();
  const catalog = metrics.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    description: m.description,
    businessQuestion: m.businessQuestion,
  }));

  const noFit = (): Composition => ({
    compositionId: id,
    narrative: `No metric in the current registry answers this directly. Consider building a metric that measures: ${question.trim()}`,
    metricIds: [],
    tiles: [],
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    const composition = noFit();
    cache.set(id, { at: Date.now(), composition });
    return composition;
  }

  // ── Call 1: metric selection ────────────────────────────────────────
  let selectedIds: string[] = [];
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: SelectionSchema,
      prompt: `You are an analyst for No Bad Company, a premium curated members club in Austin.

Metric catalog (you may ONLY choose ids from this list — never invent one):
${JSON.stringify(catalog, null, 2)}

Operator question: "${question.trim()}"

Choose the 2-4 catalog metric ids that together best answer the question. If no metric fits, return an empty array.`,
    });
    selectedIds = object.metricIds;
  } catch (e) {
    console.error('[composer] selection call failed:', e);
  }

  // Validate against the registry — Claude cannot invent metrics.
  const validIds = new Set(metrics.map((m) => m.id));
  const metricIds = selectedIds.filter((mid) => validIds.has(mid)).slice(0, 4);

  if (metricIds.length === 0) {
    const composition = noFit();
    cache.set(id, { at: Date.now(), composition });
    return composition;
  }

  // ── Run the selected metrics (workspace-scoped via the registry) ─────
  const tiles: ComposedTile[] = [];
  for (const mid of metricIds) {
    const metric = getMetric(mid);
    if (!metric) continue;
    try {
      tiles.push({ meta: toMetricMeta(metric), result: await runMetric(mid, ctx) });
    } catch (e) {
      console.error(`[composer] metric ${mid} failed:`, e);
    }
  }

  // ── Call 2: narrative synthesis ─────────────────────────────────────
  let narrative = '';
  try {
    const resultsBlock = tiles
      .map((t) => `${t.meta.name}: ${JSON.stringify(t.result.value)} — ${t.result.insight ?? ''}`)
      .join('\n');
    const { text } = await generateText({
      model: anthropic(MODEL),
      maxOutputTokens: 320,
      prompt: `Operator question: "${question.trim()}"

Metric results:
${resultsBlock}

Write the answer in at most 4 sentences. Lead with the answer to the question — no preamble, no hedging, no "it depends". Be specific and use the numbers.`,
    });
    narrative = text.trim();
  } catch (e) {
    console.error('[composer] synthesis call failed:', e);
    narrative = tiles.map((t) => t.result.insight).filter(Boolean).join(' ');
  }

  const composition: Composition = { compositionId: id, narrative, metricIds, tiles };
  cache.set(id, { at: Date.now(), composition });
  return composition;
}
