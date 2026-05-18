'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntelligenceFilterState } from '@/lib/intelligence/filters';
import { MetricTile, type Tile } from '@/app/operator/intelligence/_components/MetricTile';
import { DrillDownPanel } from '@/app/operator/intelligence/_components/DrillDownPanel';

const HEADING_FONT = 'var(--font-pp-editorial, Georgia, serif)';

type Composition = { compositionId: string; narrative: string; metricIds: string[]; tiles: Tile[] };
type SavedReport = { id: string; name: string; question: string };

export function InsightComposer({ filters }: { filters: IntelligenceFilterState }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [composition, setComposition] = useState<Composition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/intelligence/reports')
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .catch(() => {});
  }, []);

  const compose = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/intelligence/compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: trimmed, filters }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? 'composition failed.');
        else setComposition(data);
      } catch {
        setError('something broke. it’s not you. give it a second.');
      } finally {
        setBusy(false);
      }
    },
    [busy, filters],
  );

  async function saveReport() {
    if (!composition) return;
    const name = window.prompt('name this report (2-4 words)');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/intelligence/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          question,
          metricIds: composition.metricIds,
          filters,
        }),
      });
      const data = await res.json();
      if (data.report) setReports((r) => [data.report, ...r]);
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div
      className="mb-5 rounded-[12px] p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>
        ask the data
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void compose(question);
        }}
        className="mt-2 flex items-center gap-3"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="what's interesting this quarter? who should we invite to chloe's game? is the bar slipping?"
          className="flex-1 bg-transparent text-[16px] outline-none"
          style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-[6px] px-4 py-2 text-[13px] font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-primary)', opacity: busy || !question.trim() ? 0.5 : 1 }}
        >
          ask
        </button>
      </form>

      {reports.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setQuestion(r.question);
                void compose(r.question);
              }}
              className="shrink-0 rounded-full px-3 py-1 text-[11.5px]"
              style={{ background: 'var(--raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <p className="mt-4 text-[16px] italic" style={{ fontFamily: HEADING_FONT, color: 'var(--text-tertiary)' }}>
          thinking…
        </p>
      )}

      {error && !busy && (
        <p className="mt-4 text-[13px]" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {composition && !busy && (
        <div className="mt-5">
          <div className="flex items-start justify-between gap-4">
            <p
              className="max-w-[680px] text-[18px] leading-relaxed"
              style={{ fontFamily: HEADING_FONT, color: 'var(--text-primary)' }}
            >
              {composition.narrative}
            </p>
            {composition.metricIds.length > 0 && (
              <button
                onClick={saveReport}
                className="shrink-0 rounded-[6px] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em]"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                save as named report
              </button>
            )}
          </div>

          {composition.tiles.length > 0 && (
            <div className="mt-4 grid grid-cols-12 gap-4">
              {composition.tiles.map((t) => (
                <MetricTile
                  key={t.meta.id}
                  tile={t}
                  onDrillDown={(id) => {
                    const tile = composition.tiles.find((x) => x.meta.id === id);
                    if (tile) setDrill({ id, name: tile.meta.name });
                  }}
                />
              ))}
            </div>
          )}
        </div>
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
