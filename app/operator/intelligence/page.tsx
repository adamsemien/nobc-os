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
import type { ConstellationMember } from './_components/MemberConstellation';

export const dynamic = 'force-dynamic';

async function loadConstellation(workspaceId: string): Promise<ConstellationMember[]> {
  const apps = await db.application.findMany({
    where: {
      workspaceId,
      status: 'APPROVED',
      memberId: { not: null },
    },
    select: {
      memberId: true,
      fullName: true,
      archetype: true,
      archetypeScores: true,
      aiScore: true,
      reviewedAt: true,
    },
    orderBy: { reviewedAt: 'desc' },
    take: 300,
  });
  const seen = new Set<string>();
  const out: ConstellationMember[] = [];
  for (const a of apps) {
    if (!a.memberId || seen.has(a.memberId)) continue;
    seen.add(a.memberId);
    out.push({
      id: a.memberId,
      name: a.fullName,
      archetype: a.archetype || 'Connector',
      scores: (a.archetypeScores as Record<string, number> | null) ?? null,
      score: typeof a.aiScore === 'number' ? a.aiScore : 0,
    });
  }
  return out;
}

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

  const constellation = await loadConstellation(workspaceId);

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
        constellation={constellation}
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

  return (
    <IntelligenceView
      filters={filters}
      tiles={tiles}
      insights={[]}
      constellation={constellation}
    />
  );
}
