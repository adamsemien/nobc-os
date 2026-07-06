'use client';

import { useRouter } from 'next/navigation';
import { encodeFilters, type IntelligenceFilterState } from '@/lib/intelligence/filters';
import type { TierKey } from '@/lib/intelligence/types';
import { archetypeDisplayName } from '@/config/archetypes';

// Stored enum values - the filter matches on these. Chips render displayNames.
const ARCHETYPES = ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'];
const TIERS: TierKey[] = ['charter', 'standard', 'waitlist'];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11.5,
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--on-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

export function FilterBar({ filters }: { filters: IntelligenceFilterState }) {
  const router = useRouter();

  const apply = (next: IntelligenceFilterState) => {
    const qs = encodeFilters(next).toString();
    router.push(`/operator/intelligence${qs ? `?${qs}` : ''}`);
  };

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div
      className="sticky top-0 z-20 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[10px] px-4 py-3"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-tertiary)' }}>
          range
        </span>
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => apply({ ...filters, from: e.target.value || null })}
          className="rounded-[5px] px-2 py-1 text-[12px]"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => apply({ ...filters, to: e.target.value || null })}
          className="rounded-[5px] px-2 py-1 text-[12px]"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        {ARCHETYPES.map((a) => (
          <button key={a} style={chipStyle(filters.archetype.includes(a))}
            onClick={() => apply({ ...filters, archetype: toggle(filters.archetype, a) })}>
            {archetypeDisplayName(a)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {TIERS.map((t) => (
          <button key={t} style={chipStyle(filters.tier.includes(t))}
            onClick={() => apply({ ...filters, tier: toggle(filters.tier, t) })}>
            {t}
          </button>
        ))}
      </div>

      <button
        style={chipStyle(filters.compare !== null)}
        onClick={() => apply({ ...filters, compare: filters.compare ? null : 'previous' })}
      >
        {filters.compare === 'year-ago' ? 'vs year ago' : filters.compare ? 'vs previous' : 'no compare'}
      </button>

      <button
        style={chipStyle(filters.demo)}
        onClick={() => apply({ ...filters, demo: !filters.demo })}
        className="ml-auto"
      >
        ✦ demo mode {filters.demo ? 'on' : 'off'}
      </button>
    </div>
  );
}
