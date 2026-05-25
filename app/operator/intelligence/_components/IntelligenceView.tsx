'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { encodeFilters, type IntelligenceFilterState } from '@/lib/intelligence/filters';
import { FilterBar } from './FilterBar';
import { MetricTile, type Tile } from './MetricTile';
import { DrillDownPanel } from './DrillDownPanel';
import { InsightCard, type InsightRecord } from './InsightCard';
import { InsightComposer } from '@/components/intelligence/InsightComposer';
import { MemberConstellation, type ConstellationMember } from './MemberConstellation';
import { ApplicationFunnel, type FunnelSnapshot } from './ApplicationFunnel';
import { HousePhonePanel } from './HousePhonePanel';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'community', label: 'Community' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'taste', label: 'Taste' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'house-phone', label: 'House Phone' },
  { key: 'insights', label: 'Insights' },
];

const HEADING_FONT = 'var(--font-pp-editorial, Georgia, serif)';

export function IntelligenceView({
  filters,
  tiles,
  insights,
  constellation = [],
  funnel,
}: {
  filters: IntelligenceFilterState;
  tiles: Tile[];
  insights: InsightRecord[];
  constellation?: ConstellationMember[];
  funnel?: FunnelSnapshot;
}) {
  const router = useRouter();
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  // Deep link from the operator agent — #<metricId> scrolls to that tile
  // and flashes a brief accent ring so the answer is unmistakable.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('metric-flash');
    const t = window.setTimeout(() => el.classList.remove('metric-flash'), 2600);
    return () => window.clearTimeout(t);
  }, [tiles]);

  const goCategory = (key: string) => {
    const qs = encodeFilters({ ...filters, category: key }).toString();
    router.push(`/operator/intelligence${qs ? `?${qs}` : ''}`);
  };

  const openDrill = (id: string) => {
    const tile = tiles.find((t) => t.meta.id === id);
    if (tile) setDrill({ id, name: tile.meta.name });
  };

  const isInsights = filters.category === 'insights';
  const isHousePhone = filters.category === 'house-phone';

  return (
    <div className="min-h-screen px-6 py-6 md:px-10" style={{ color: 'var(--text-primary)' }}>
      <div className="mb-5">
        <h1 className="text-[30px] italic leading-tight" style={{ fontFamily: HEADING_FONT, fontWeight: 200 }}>
          Intelligence
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          A registry of metrics — the dashboard, the agent, and sponsor decks all read from it.
        </p>
      </div>

      {funnel && <ApplicationFunnel snapshot={funnel} />}

      {constellation.length > 0 && <MemberConstellation members={constellation} />}

      <InsightComposer filters={filters} />

      {filters.demo && (
        <div
          className="mb-4 rounded-[8px] px-4 py-2.5 text-[12px]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          Demo mode — every metric is reading synthetic data. Numbers are illustrative.
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => goCategory(c.key)}
            className="relative px-4 py-2.5 text-[13px] font-medium"
            style={{ color: filters.category === c.key ? 'var(--accent)' : 'var(--text-secondary)' }}
          >
            {c.label}
            {filters.category === c.key && (
              <span className="absolute inset-x-2 -bottom-px h-[2px]" style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>

      {!isInsights && !isHousePhone && <FilterBar filters={filters} />}

      {isHousePhone ? (
        <HousePhonePanel />
      ) : isInsights ? (
        insights.length > 0 ? (
          <div className="flex flex-col gap-3">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-center text-[14px]" style={{ color: 'var(--text-tertiary)' }}>
            Intelligence summary refreshes nightly. Check back tomorrow.
          </p>
        )
      ) : tiles.length > 0 ? (
        <div className="grid grid-cols-12 gap-4">
          {tiles.map((t) => (
            <MetricTile key={t.meta.id} tile={t} onDrillDown={openDrill} />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-[14px]" style={{ color: 'var(--text-tertiary)' }}>
          No metrics in this category yet.
        </p>
      )}

      {drill && (
        <DrillDownPanel
          metricId={drill.id}
          metricName={drill.name}
          filters={filters}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
