/** Metric Registry — type system.
 *
 *  Every intelligence metric is one file exporting a `Metric`. The dashboard,
 *  the AI agent (via MCP), and the sponsor wrap-deck pipeline are all just
 *  consumers of the registry. Adding a metric must never require a UI change. */

export type MetricCategory =
  | 'pipeline'
  | 'community'
  | 'engagement'
  | 'taste'
  | 'sponsors'
  | 'revenue'
  | 'operations';

export type MetricResultType = 'scalar' | 'series' | 'breakdown' | 'list' | 'matrix' | 'cohort';

export type MetricViz =
  | 'number'
  | 'sparkline'
  | 'line'
  | 'bar'
  | 'horizontal-bar'
  | 'donut'
  | 'heatmap'
  | 'table'
  | 'funnel';

export type MetricFormat = 'number' | 'percent' | 'currency' | 'duration' | 'days';

export type MetricRefresh = 'live' | 'cached-5min' | 'cached-hourly' | 'nightly-batch';

/* ── Result value shapes ─────────────────────────────────────── */

export type TimeSeriesPoint = { label: string; value: number };
export type TimeSeries = TimeSeriesPoint[];

export type BreakdownItem = {
  label: string;
  value: number;
  percent?: number;
  color?: string;
  delta?: number;
  /** Optional verbatim samples surfaced on drill-down (e.g. member quotes). */
  samples?: string[];
};
export type Breakdown = BreakdownItem[];

export type FunnelStage = { label: string; value: number };

export type MatrixCell = { key: string; value: string | number; bar?: number };
export type MatrixRow = { label: string; cells: MatrixCell[]; note?: string };
export type Matrix = MatrixRow[];

export type RecordRow = Record<string, string | number | boolean | null>;
export type RecordList = RecordRow[];

export type MetricValue = number | TimeSeries | Breakdown | FunnelStage[] | Matrix | RecordList;

/* ── Context + result ────────────────────────────────────────── */

export type TierKey = 'charter' | 'standard' | 'waitlist';

export type MetricFilters = {
  archetype?: string[];
  tier?: TierKey[];
  source?: string[];
  neighborhood?: string[];
};

export interface MetricContext {
  /** ALWAYS required — the registry refuses to run a metric without it. */
  workspaceId: string;
  dateRange?: { from: Date; to: Date };
  comparePeriod?: 'previous' | 'year-ago' | null;
  filters?: MetricFilters;
  /** When true the metric must bypass the DB and read synthetic data. */
  demoMode?: boolean;
}

export interface MetricChange {
  absolute: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface MetricResult {
  value: MetricValue;
  previousValue?: MetricValue;
  change?: MetricChange;
  format: MetricFormat;
  unit?: string;
  /** 1-sentence "what this means" — surfaced directly in the UI. */
  insight?: string;
  drillDownAvailable: boolean;
  /** Optional trend line for scalar metrics rendered with a sparkline. */
  sparkline?: TimeSeries;
}

export type DrillDownRecord = Record<string, string | number | boolean | null>;

export interface Metric {
  /** Dotted id, e.g. 'pipeline.application-funnel'. */
  id: string;
  name: string;
  category: MetricCategory;
  description: string;
  /** The sponsor/operator question this metric answers. */
  businessQuestion: string;
  resultType: MetricResultType;
  viz: MetricViz;
  query: (ctx: MetricContext) => Promise<MetricResult>;
  drillDown?: (ctx: MetricContext) => Promise<DrillDownRecord[]>;
  refresh: MetricRefresh;
  /** If true, auto-registered as an MCP tool `intelligence.{id}`. */
  mcpExposed: boolean;
}

/** Serializable metric metadata — safe to pass server → client. */
export interface MetricMeta {
  id: string;
  name: string;
  category: MetricCategory;
  description: string;
  businessQuestion: string;
  resultType: MetricResultType;
  viz: MetricViz;
  mcpExposed: boolean;
}

export function toMetricMeta(m: Metric): MetricMeta {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    description: m.description,
    businessQuestion: m.businessQuestion,
    resultType: m.resultType,
    viz: m.viz,
    mcpExposed: m.mcpExposed,
  };
}

export const METRIC_CATEGORIES: MetricCategory[] = [
  'pipeline',
  'community',
  'engagement',
  'taste',
  'sponsors',
  'revenue',
  'operations',
];

export const CHARTER_WORTH_THRESHOLD = 22;
export const STANDARD_WORTH_THRESHOLD = 16;
