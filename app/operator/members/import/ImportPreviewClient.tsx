'use client';

import { useState } from 'react';

/** Dry-run CSV import preview. Posts CSV text to /api/operator/crm/import/preview
 *  (read-only; writes nothing) and renders what an import WOULD do — how many
 *  contacts create, match an existing member, or need operator review. The
 *  persisting import lands in the Contact-spine schema window. */

type MatchKey = 'email_exact' | 'phone' | 'instagram';
type ReviewReason = 'soft_match' | 'conflicting_identity' | 'ambiguous';

type PreviewRow = {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  decision: 'create' | 'match' | 'review';
  matchedContact?: { id: string; name: string } | null;
  reason?: ReviewReason;
  candidates?: { id: string; name: string; key: MatchKey }[];
  identityless?: boolean;
};

type PreviewResponse = {
  ok: true;
  summary: {
    totalRows: number;
    parsed: number;
    skipped: number;
    create: number;
    match: number;
    review: number;
    reviewByReason: Record<ReviewReason, number>;
    identityless: number;
  };
  unmappedHeaders: string[];
  rows: PreviewRow[];
  rowsTruncated: boolean;
  skippedRows: { row: number; reason: string }[];
};

const REASON_LABEL: Record<ReviewReason, string> = {
  soft_match: 'Phone/Instagram only',
  conflicting_identity: 'Signals disagree',
  ambiguous: 'Matches several',
};

const KEY_LABEL: Record<MatchKey, string> = {
  email_exact: 'email',
  phone: 'phone',
  instagram: 'Instagram',
};

const SAMPLE_CSV = `name,email,phone,instagram,tags
Devin Hsu,devin@example.com,512-555-0143,@devinhsu,vendor
Amara Cole,,(512) 555-0199,amaracole,
Jordan Lee,jordan@example.com,,,vip`;

export function ImportPreviewClient() {
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);

  async function readFile(file: File) {
    const text = await file.text();
    setCsv(text);
  }

  async function runPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/operator/crm/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Preview failed.');
        return;
      }
      setResult(data as PreviewResponse);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 max-w-5xl">
      {/* ── Input ── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-medium text-text-primary">Paste CSV, or choose a file</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCsv(SAMPLE_CSV)}
              className="text-xs text-text-muted hover:text-text-secondary hover:underline"
            >
              Load sample
            </button>
            <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-background">
              Choose file…
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="name,email,phone,instagram,tags&#10;Devin Hsu,devin@example.com,512-555-0143,@devinhsu,vendor"
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || !csv.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Previewing…' : 'Preview import'}
          </button>
          <span className="text-xs text-text-muted">
            Dry run — this reads your members to match identities and writes nothing.
          </span>
        </div>
        {error && (
          <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-text-primary">{error}</p>
        )}
      </div>

      {/* ── Result ── */}
      {result && <PreviewResult result={result} />}
    </div>
  );
}

function PreviewResult({ result }: { result: PreviewResponse }) {
  const { summary } = result;
  return (
    <div className="mt-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="New contacts" value={summary.create} tone="success" />
        <SummaryCard label="Match existing" value={summary.match} tone="primary" />
        <SummaryCard label="Need review" value={summary.review} tone="warning" />
        <SummaryCard label="Skipped" value={summary.skipped} tone="muted" />
      </div>

      <p className="mt-3 text-xs text-text-muted">
        {summary.totalRows} data row{summary.totalRows === 1 ? '' : 's'} read · {summary.parsed} parsed
        {summary.identityless > 0 && ` · ${summary.identityless} new with no email/phone/Instagram`}
        {summary.review > 0 &&
          ` · review: ${reasonBreakdown(summary.reviewByReason)}`}
      </p>

      {result.unmappedHeaders.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Unmapped columns (ignored): {result.unmappedHeaders.join(', ')}
        </p>
      )}

      {/* Decisions table */}
      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs text-text-muted">
              <th className="px-4 py-2.5 font-medium">Contact</th>
              <th className="px-4 py-2.5 font-medium">Identity</th>
              <th className="px-4 py-2.5 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={`${row.externalId}-${i}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-text-primary">{row.name}</div>
                  <div className="text-xs text-text-muted">{row.email ?? '—'}</div>
                </td>
                <td className="px-4 py-3 align-top text-xs text-text-secondary">
                  {[row.phone, row.instagram ? `@${row.instagram}` : null].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-3 align-top">
                  <OutcomeCell row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.rowsTruncated && (
        <p className="mt-3 text-xs text-text-muted">
          Showing the first {result.rows.length} rows — counts above cover the full file.
        </p>
      )}

      {result.skippedRows.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-text-primary">Skipped rows</h3>
          <ul className="mt-2 space-y-1 text-xs text-text-muted">
            {result.skippedRows.map((s) => (
              <li key={s.row}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OutcomeCell({ row }: { row: PreviewRow }) {
  if (row.decision === 'create') {
    return (
      <div>
        <Badge tone="success">New contact</Badge>
        {row.identityless && (
          <div className="mt-1 text-xs text-text-muted">No email/phone/Instagram — can’t be deduped.</div>
        )}
      </div>
    );
  }
  if (row.decision === 'match') {
    return (
      <div>
        <Badge tone="primary">Matches existing</Badge>
        <div className="mt-1 text-xs text-text-secondary">{row.matchedContact?.name}</div>
      </div>
    );
  }
  return (
    <div>
      <Badge tone="warning">Needs review</Badge>
      <div className="mt-1 text-xs text-text-secondary">
        {row.reason ? REASON_LABEL[row.reason] : ''}
        {row.candidates && row.candidates.length > 0 && (
          <>
            {' — '}
            {row.candidates.map((c, i) => (
              <span key={c.id + i}>
                {i > 0 && ', '}
                {c.name} <span className="text-text-muted">({KEY_LABEL[c.key]})</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

type Tone = 'success' | 'primary' | 'warning' | 'muted';

const TONE_BG: Record<Tone, string> = {
  success: 'bg-success-soft',
  primary: 'bg-primary-soft',
  warning: 'bg-warning-soft',
  muted: 'bg-background',
};

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={`rounded-xl border border-border ${TONE_BG[tone]} p-4`}>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      <div className="mt-0.5 text-xs text-text-secondary">{label}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full ${TONE_BG[tone]} px-2.5 py-1 text-xs font-medium text-text-primary`}>
      {children}
    </span>
  );
}

function reasonBreakdown(r: Record<ReviewReason, number>): string {
  return (Object.entries(r) as [ReviewReason, number][])
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${REASON_LABEL[reason].toLowerCase()}`)
    .join(', ');
}
