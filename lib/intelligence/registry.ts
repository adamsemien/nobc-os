/** Metric Registry — the catalog every consumer (dashboard, MCP agent,
 *  wrap-deck pipeline) reads from.
 *
 *  Workspace scoping is enforced here, at registration and at run time:
 *  a metric whose query never references `workspaceId` is refused. */
import type {
  DrillDownRecord,
  Metric,
  MetricCategory,
  MetricContext,
  MetricResult,
} from './types';

const REGISTRY = new Map<string, Metric>();

const REFRESH_TTL_MS: Record<Metric['refresh'], number> = {
  live: 0,
  'cached-5min': 5 * 60_000,
  'cached-hourly': 60 * 60_000,
  'nightly-batch': 24 * 60 * 60_000,
};

const cache = new Map<string, { at: number; result: MetricResult }>();

/** Registers a metric. Throws if the query is not workspace-scoped. */
export function registerMetric(metric: Metric): void {
  const source = metric.query.toString();
  if (!source.includes('workspaceId')) {
    throw new Error(
      `Metric "${metric.id}" is not workspace-scoped — its query never references workspaceId. Refusing to register.`,
    );
  }
  REGISTRY.set(metric.id, metric); // idempotent — supports dev HMR
}

export function getMetric(id: string): Metric | undefined {
  return REGISTRY.get(id);
}

export function listMetrics(filter?: { category?: MetricCategory; search?: string }): Metric[] {
  let all = [...REGISTRY.values()];
  if (filter?.category) all = all.filter((m) => m.category === filter.category);
  if (filter?.search) {
    const q = filter.search.toLowerCase();
    all = all.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q),
    );
  }
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

function cacheKey(id: string, ctx: MetricContext): string {
  return JSON.stringify({
    id,
    ws: ctx.workspaceId,
    range: ctx.dateRange && { f: +ctx.dateRange.from, t: +ctx.dateRange.to },
    compare: ctx.comparePeriod ?? null,
    filters: ctx.filters ?? null,
  });
}

/** Runs a metric. Enforces workspaceId presence and applies the cache policy.
 *  Demo mode always runs fresh (synthetic data is cheap and has no DB cost). */
export async function runMetric(id: string, ctx: MetricContext): Promise<MetricResult> {
  const metric = REGISTRY.get(id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  if (!ctx.workspaceId) {
    throw new Error(`runMetric("${id}") called without a workspaceId — every query must be workspace-scoped.`);
  }

  const ttl = REFRESH_TTL_MS[metric.refresh];
  if (!ctx.demoMode && ttl > 0) {
    const key = cacheKey(id, ctx);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.result;
    const result = await metric.query(ctx);
    cache.set(key, { at: Date.now(), result });
    return result;
  }

  return metric.query(ctx);
}

export async function getDrillDown(id: string, ctx: MetricContext): Promise<DrillDownRecord[]> {
  const metric = REGISTRY.get(id);
  if (!metric) throw new Error(`Unknown metric: ${id}`);
  if (!ctx.workspaceId) {
    throw new Error(`getDrillDown("${id}") called without a workspaceId.`);
  }
  if (!metric.drillDown) return [];
  return metric.drillDown(ctx);
}

/** Metrics flagged mcpExposed — consumed by the MCP route to auto-register tools. */
export function mcpMetrics(): Metric[] {
  return [...REGISTRY.values()].filter((m) => m.mcpExposed);
}
