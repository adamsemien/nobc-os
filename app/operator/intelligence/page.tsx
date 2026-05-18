import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import {
  buildContext,
  listMetrics,
  parseFilters,
  runMetric,
  toMetricMeta,
  type MetricCategory,
} from '@/lib/intelligence';
import { IntelligenceView } from './_components/IntelligenceView';
import type { Tile } from './_components/MetricTile';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/');
  const workspaceId = await requireWorkspaceId(userId);

  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') params.set(k, v);
  const filters = parseFilters(params);
  const ctx = buildContext(workspaceId, filters);

  if (filters.category === 'insights') {
    const rows = await db.intelligenceInsight.findMany({
      where: { workspaceId },
      orderBy: { generatedAt: 'desc' },
      take: 20,
    });
    return (
      <IntelligenceView
        filters={filters}
        tiles={[]}
        insights={rows.map((r) => ({
          id: r.id,
          metricId: r.metricId,
          narrative: r.narrative,
          generatedAt: r.generatedAt.toISOString(),
          acknowledged: r.acknowledged,
        }))}
      />
    );
  }

  const metrics = listMetrics({ category: filters.category as MetricCategory });
  const tiles: Tile[] = await Promise.all(
    metrics.map(async (m): Promise<Tile> => {
      try {
        return { meta: toMetricMeta(m), result: await runMetric(m.id, ctx) };
      } catch (e) {
        return { meta: toMetricMeta(m), error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  return <IntelligenceView filters={filters} tiles={tiles} insights={[]} />;
}
