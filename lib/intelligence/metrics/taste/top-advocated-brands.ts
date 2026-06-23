import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { Breakdown, DrillDownRecord, Metric, MetricContext, MetricResult } from '@/lib/intelligence/types';
import { DEMO_BRAND_CLUSTERS } from '@/lib/intelligence/demo-data';

/** Advocacy question keys — both the live /apply form's dotted keys and the
 *  canonical QuestionDefinition stableKeys, so either form is covered. */
const ADVOCACY_KEYS: Record<string, string> = {
  'taste.recommend': 'Recommend like paid for it',
  taste_recommend_paid: 'Recommend like paid for it',
  'taste.detailsRight': 'Place that gets details right',
  taste_place_details: 'Place that gets details right',
  'taste.trustTaste': 'Whose taste they trust',
  taste_trust_taste: 'Whose taste they trust',
};

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const value: Breakdown = DEMO_BRAND_CLUSTERS.map((c) => ({
      label: c.label,
      value: c.count,
      samples: c.samples,
    }));
    const top = [...DEMO_BRAND_CLUSTERS].sort((a, b) => b.count - a.count).slice(0, 3);
    return {
      value,
      format: 'number',
      unit: 'mentions',
      insight: `Top categories by mention volume are ${top.map((t) => t.label).join(', ')}. The ${top[1].label} cluster aligns with the Foxtrot and Resy sponsor targets.`,
      drillDownAvailable: true,
    };
  }

  // Live mode: brand-level clustering is a nightly AI batch (MECHANICAL_MODEL
  // tier, deferred). On page load we show advocacy-question
  // response volume — cheap, honest, and DB-only.
  const answers = await db.applicationAnswer.findMany({
    where: {
      questionKey: { in: Object.keys(ADVOCACY_KEYS) },
      application: { is: { workspaceId: ctx.workspaceId } },
    },
    select: { questionKey: true, answer: true },
  });

  const tally: Record<string, number> = {};
  for (const a of answers) {
    if (a.answer.trim().length < 3) continue;
    const label = ADVOCACY_KEYS[a.questionKey];
    tally[label] = (tally[label] ?? 0) + 1;
  }

  const value: Breakdown = Object.entries(tally)
    .map(([label, count]) => ({ label, value: count }))
    .sort((a, b) => b.value - a.value);

  return {
    value,
    format: 'number',
    unit: 'responses',
    insight:
      'Brand-level clustering runs as a nightly AI batch (not yet wired). Showing advocacy-question response volume — switch on Demo mode to preview the clustered view.',
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  if (ctx.demoMode) {
    return DEMO_BRAND_CLUSTERS.flatMap((c) =>
      c.samples.map((quote) => ({ brand: c.label, category: c.category, quote })),
    );
  }
  const answers = await db.applicationAnswer.findMany({
    where: {
      questionKey: { in: Object.keys(ADVOCACY_KEYS) },
      application: { is: { workspaceId: ctx.workspaceId } },
    },
    select: { questionKey: true, answer: true, application: { select: { fullName: true } } },
    take: 300,
  });
  return answers
    .filter((a) => a.answer.trim().length >= 3)
    .map((a) => ({
      member: a.application.fullName,
      question: ADVOCACY_KEYS[a.questionKey],
      answer: a.answer.slice(0, 280),
    }));
}

const metric: Metric = {
  id: 'taste.top-advocated-brands',
  name: 'Top Advocated Brands',
  category: 'taste',
  description: 'Brands and categories members recommend unsolicited — direct evidence of audience-brand fit.',
  businessQuestion: 'What specific brands are members advocating for? This is the evidence that closes sponsor deals.',
  resultType: 'breakdown',
  viz: 'horizontal-bar',
  query,
  drillDown,
  refresh: 'nightly-batch',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
