/** URL-state filters for the Intelligence dashboard.
 *
 *  Filters live in the URL so dashboard views are shareable. Metrics never
 *  read URL state — the composer parses it and passes a MetricContext down. */
import type { MetricContext, MetricFilters, TierKey } from './types';

export type IntelligenceFilterState = {
  category: string;
  from: string | null; // ISO date (yyyy-mm-dd)
  to: string | null;
  archetype: string[];
  tier: TierKey[];
  source: string[];
  neighborhood: string[];
  compare: 'previous' | 'year-ago' | null;
  demo: boolean;
};

const TIERS: TierKey[] = ['charter', 'standard', 'waitlist'];

export const DEFAULT_FILTER_STATE: IntelligenceFilterState = {
  category: 'pipeline',
  from: null,
  to: null,
  archetype: [],
  tier: [],
  source: [],
  neighborhood: [],
  compare: 'previous',
  demo: false,
};

function csv(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseFilters(params: URLSearchParams): IntelligenceFilterState {
  const compareRaw = params.get('compare');
  return {
    category: params.get('category') || DEFAULT_FILTER_STATE.category,
    from: params.get('from') || null,
    to: params.get('to') || null,
    archetype: csv(params.get('archetype')),
    tier: csv(params.get('tier')).filter((t): t is TierKey => (TIERS as string[]).includes(t)),
    source: csv(params.get('source')),
    neighborhood: csv(params.get('neighborhood')),
    compare: compareRaw === 'year-ago' ? 'year-ago' : compareRaw === 'off' ? null : 'previous',
    demo: params.get('demo') === '1',
  };
}

export function encodeFilters(state: IntelligenceFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.category !== DEFAULT_FILTER_STATE.category) p.set('category', state.category);
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  if (state.archetype.length) p.set('archetype', state.archetype.join(','));
  if (state.tier.length) p.set('tier', state.tier.join(','));
  if (state.source.length) p.set('source', state.source.join(','));
  if (state.neighborhood.length) p.set('neighborhood', state.neighborhood.join(','));
  if (state.compare === 'year-ago') p.set('compare', 'year-ago');
  else if (state.compare === null) p.set('compare', 'off');
  if (state.demo) p.set('demo', '1');
  return p;
}

/** Builds the MetricContext every metric query receives. Date range defaults
 *  to the last 90 days when unspecified. */
export function buildContext(
  workspaceId: string,
  state: IntelligenceFilterState,
): MetricContext {
  const to = state.to ? new Date(`${state.to}T23:59:59`) : new Date();
  const from = state.from
    ? new Date(`${state.from}T00:00:00`)
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

  const filters: MetricFilters = {};
  if (state.archetype.length) filters.archetype = state.archetype;
  if (state.tier.length) filters.tier = state.tier;
  if (state.source.length) filters.source = state.source;
  if (state.neighborhood.length) filters.neighborhood = state.neighborhood;

  return {
    workspaceId,
    dateRange: { from, to },
    comparePeriod: state.compare,
    filters: Object.keys(filters).length ? filters : undefined,
    demoMode: state.demo,
  };
}
