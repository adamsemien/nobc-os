import type {
  Breakdown,
  FunnelStage,
  Matrix,
  MetricMeta,
  MetricResult,
  RecordList,
  TimeSeries,
} from '@/lib/intelligence/types';
import { Donut, Funnel, HBar, Line, Sparkline } from './charts';

export type Tile = { meta: MetricMeta; result?: MetricResult; error?: string };

const HEADING_FONT = 'var(--font-pp-editorial, Georgia, serif)';

function fmt(n: number, format: MetricResult['format']): string {
  if (format === 'percent') return `${n}%`;
  if (format === 'currency') return `$${Math.round(n).toLocaleString()}`;
  if (format === 'days') return `${n}d`;
  if (format === 'duration') return `${n}m`;
  return n.toLocaleString();
}

function spanClass(viz: MetricMeta['viz']): string {
  if (viz === 'number') return 'col-span-12 sm:col-span-6 lg:col-span-3';
  if (viz === 'table' || viz === 'heatmap') return 'col-span-12';
  return 'col-span-12 lg:col-span-6';
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'cells' in value[0];
}

function Body({ meta, result }: { meta: MetricMeta; result: MetricResult }) {
  const v = result.value;

  if (meta.viz === 'number' && typeof v === 'number') {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[34px] font-semibold leading-none" style={{ color: 'var(--accent)' }}>
            {fmt(v, result.format)}
          </span>
          {result.change && result.change.direction !== 'flat' && (
            <span
              className="text-[12px] font-medium"
              style={{ color: result.change.direction === 'up' ? 'var(--success)' : 'var(--danger)' }}
            >
              {result.change.direction === 'up' ? '↑' : '↓'} {Math.abs(result.change.absolute)}
            </span>
          )}
        </div>
        {result.sparkline && result.sparkline.length > 1 && (
          <div className="mt-3">
            <Sparkline points={result.sparkline} />
          </div>
        )}
      </div>
    );
  }

  if (meta.viz === 'funnel' && Array.isArray(v)) {
    return <Funnel stages={v as FunnelStage[]} />;
  }

  if (meta.viz === 'donut' && Array.isArray(v)) {
    const b = v as Breakdown;
    return (
      <div className="flex flex-wrap items-center gap-5">
        <Donut segments={b.map((i) => ({ label: i.label, value: i.value, color: i.color ?? 'var(--accent)' }))} />
        <div className="flex flex-col gap-1.5">
          {b.map((i) => (
            <div key={i.label} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-[10px] w-[10px] rounded-full" style={{ background: i.color ?? 'var(--accent)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{i.label}</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {i.value}
                {i.percent !== undefined && ` · ${i.percent}%`}
              </span>
              {i.delta !== undefined && i.delta !== 0 && (
                <span style={{ color: i.delta > 0 ? 'var(--success)' : 'var(--danger)', fontSize: 11 }}>
                  {i.delta > 0 ? '↑' : '↓'}{Math.abs(i.delta)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((meta.viz === 'horizontal-bar' || meta.viz === 'bar') && Array.isArray(v)) {
    const b = v as Breakdown;
    return <HBar labelWidth={200} items={b.map((i) => ({ label: i.label, value: i.value, color: i.color }))} />;
  }

  if (meta.viz === 'line' && Array.isArray(v)) {
    return <Line points={v as TimeSeries} />;
  }

  if (meta.viz === 'table') {
    if (isMatrix(v)) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {v.map((row, ri) => (
                <tr key={ri} style={{ borderTop: ri ? '1px solid var(--border)' : 'none' }}>
                  <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {row.label}
                  </td>
                  {row.cells.map((c) => (
                    <td key={c.key} className="py-2 pr-3" style={{ color: 'var(--text-secondary)' }}>
                      {c.bar !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className="h-[8px] w-16 overflow-hidden rounded-full" style={{ background: 'var(--raised)' }}>
                            <div className="h-full rounded-full" style={{ width: `${c.bar}%`, background: 'var(--accent)' }} />
                          </div>
                          <span style={{ color: 'var(--text-primary)' }}>{c.value}</span>
                        </div>
                      ) : (
                        c.value
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    const rows = v as RecordList;
    if (rows.length === 0) {
      return <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>nothing here yet.</p>;
    }
    const keys = Object.keys(rows[0]);
    return (
      <div className="max-h-[260px] overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr>
              {keys.map((k) => (
                <th
                  key={k}
                  className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, ri) => (
              <tr key={ri} style={{ borderTop: '1px solid var(--border)' }}>
                {keys.map((k) => (
                  <td key={k} className="py-1.5 pr-3" style={{ color: 'var(--text-secondary)' }}>
                    {String(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>—</p>;
}

export function MetricTile({ tile, onDrillDown }: { tile: Tile; onDrillDown: (id: string) => void }) {
  const { meta, result, error } = tile;
  return (
    <div className={spanClass(meta.viz)}>
      <div
        id={meta.id}
        className="flex h-full flex-col rounded-[12px] p-6 scroll-mt-24"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[19px] italic leading-tight" style={{ fontFamily: HEADING_FONT, fontWeight: 200 }}>
              {meta.name}
            </h3>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {meta.description}
            </p>
          </div>
          {result?.drillDownAvailable && (
            <button
              onClick={() => onDrillDown(meta.id)}
              className="shrink-0 rounded-[5px] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em]"
              style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              drill down
            </button>
          )}
        </div>

        <div className="flex-1">
          {error ? (
            <p className="text-[12px]" style={{ color: 'var(--danger)' }}>
              metric failed: {error}
            </p>
          ) : result ? (
            <Body meta={meta} result={result} />
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>no data.</p>
          )}
        </div>

        {result?.insight && (
          <p
            className="mt-4 border-t pt-3 text-[12px] italic"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {result.insight}
          </p>
        )}
      </div>
    </div>
  );
}
