'use client';
/**
 * Client-side row management for the operator shares page.
 *
 * - Per-row "Copy URL" with a short-lived "Copied" affordance.
 * - Per-row Delete that calls `DELETE /api/share/links/[id]` and removes the
 *   row optimistically on success.
 * - Filter pills (All / Sponsor / Gallery) so a busy workspace can scope the
 *   list quickly.
 *
 * Empty state nudges the operator back to the media grid to start a share.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';

export interface ShareRow {
  id: string;
  token: string;
  mode: 'sponsor' | 'gallery';
  url: string;
  folderName: string;
  folderDeleted: boolean;
  passwordProtected: boolean;
  watermark: boolean;
  allowedDownloads: number | null;
  downloadsUsed: number;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
}

type Filter = 'all' | 'sponsor' | 'gallery';

export function SharesList({ initial }: { initial: ShareRow[] }) {
  const [rows, setRows] = useState<ShareRow[]>(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.mode === filter)),
    [rows, filter],
  );

  async function copy(row: ShareRow) {
    try {
      await navigator.clipboard.writeText(row.url);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 1500);
    } catch {
      // Clipboard API blocked — fall back to selecting the text.
    }
  }

  async function remove(row: ShareRow) {
    if (!confirm(`Delete this share link?\n\nThe link will stop working immediately. The underlying folder is preserved.`)) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/share/links/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not delete the link.');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      console.error('[SharesList] delete failed', e);
      setError('Network error. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([
            ['all', 'All'],
            ['sponsor', 'Sponsor'],
            ['gallery', 'Gallery'],
          ] as const).map(([value, label]) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className="rounded-[6px] border px-2.5 py-1 text-[12px]"
                style={{
                  background: active ? 'var(--primary)' : 'var(--card)',
                  color: active ? 'var(--primary-foreground)' : 'var(--text-primary)',
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'share' : 'shares'}
        </p>
      </div>

      {error ? (
        <div
          className="mb-3 rounded-[8px] border px-3 py-2 text-[12px]"
          style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
        >
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="rounded-[10px] border p-4"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-[4px] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em]"
                      style={{ background: 'var(--raised)', color: 'var(--text-secondary)' }}
                    >
                      {row.mode === 'sponsor' ? 'Sponsor' : 'Gallery'}
                    </span>
                    <p className="truncate text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {row.folderName}
                      {row.folderDeleted ? (
                        <span className="ml-2 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--primary)' }}>
                          Folder deleted
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <span>{row.accessCount} {row.accessCount === 1 ? 'view' : 'views'}</span>
                    <span>·</span>
                    <span>{row.downloadsUsed}{row.allowedDownloads != null ? `/${row.allowedDownloads}` : ''} downloaded</span>
                    {row.expiresAt ? (
                      <>
                        <span>·</span>
                        <span>Expires {new Date(row.expiresAt).toLocaleDateString()}</span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span>Created {new Date(row.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {row.passwordProtected ? (
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="h-3 w-3" /> Password
                      </span>
                    ) : null}
                    {row.watermark ? (
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Watermark
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copy(row)}
                    className="flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px]"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    {copiedId === row.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === row.id ? 'Copied' : 'Copy link'}
                  </button>
                  <Link
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px]"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => remove(row)}
                    className="flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--primary)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {busyId === row.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div
      className="rounded-[10px] border p-10 text-center"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
        {filter === 'all'
          ? 'No share links yet. Select assets in Media and use the Share button to create one.'
          : `No ${filter === 'sponsor' ? 'sponsor' : 'gallery'} shares yet.`}
      </p>
      <Link
        href="/operator/media"
        className="mt-3 inline-block text-[12px] underline-offset-2 hover:underline"
        style={{ color: 'var(--primary)' }}
      >
        ← Back to Media
      </Link>
    </div>
  );
}
