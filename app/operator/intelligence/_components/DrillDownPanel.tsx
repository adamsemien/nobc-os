'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { encodeFilters, type IntelligenceFilterState } from '@/lib/intelligence/filters';

type Row = Record<string, string | number | boolean | null>;

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}

export function DrillDownPanel({
  metricId,
  metricName,
  filters,
  onClose,
}: {
  metricId: string;
  metricName: string;
  filters: IntelligenceFilterState;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const qs = encodeFilters(filters);
    qs.set('metric', metricId);
    fetch(`/api/operator/intelligence/drilldown?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) setError(d.error);
        else setRows(d.rows ?? []);
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [metricId, filters]);

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metricId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const keys = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label={`${metricName} detail`}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        role="button"
        tabIndex={0}
        aria-label="Close panel"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
      />
      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {metricName}
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {filters.demo ? 'demo data' : 'live data'}
              {filters.archetype.length ? ` · ${filters.archetype.join(', ')}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: 'var(--text-secondary)' }}>
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {error && <p className="text-[13px]" style={{ color: 'var(--danger)' }}>{error}</p>}
          {!error && !rows && <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>loading…</p>}
          {rows && rows.length === 0 && (
            <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>no records.</p>
          )}
          {rows && rows.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  {keys.map((k) => (
                    <th key={k} className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-[0.08em]"
                      style={{ color: 'var(--text-tertiary)' }}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    {keys.map((k) => (
                      <td key={k} className="py-1.5 pr-3" style={{ color: 'var(--text-secondary)' }}>
                        {String(r[k] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={exportCsv}
            disabled={!rows || rows.length === 0}
            className="rounded-[6px] px-3 py-2 text-[12px] font-medium"
            style={{ background: 'var(--accent)', color: 'var(--on-primary)', opacity: rows && rows.length ? 1 : 0.5 }}
          >
            Export CSV
          </button>
        </div>
      </aside>
    </div>
  );
}
