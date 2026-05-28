'use client';
/**
 * Operator-side "Share these N assets" modal. Two phases:
 *
 *   1. Form — type (sponsor/gallery), optional password, watermark toggle,
 *      allowedDownloads number. Submits to POST /api/share/links with
 *      `assetIds`, which wraps the selection in a fresh MediaFolder and
 *      creates the ShareLink.
 *   2. Result — shows the resulting public URL with a copy-to-clipboard
 *      button and a link to the full shares list.
 *
 * Renders an editorial-light dark-on-cream layout consistent with the rest of
 * the operator media UI.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, X } from 'lucide-react';

interface CreateBody {
  assetIds: string[];
  type: 'sponsor' | 'gallery';
  password?: string;
  watermark: boolean;
  allowedDownloads?: number;
}

interface CreateResponse {
  id: string;
  token: string;
  mode: string;
  path: string;
  url: string;
  createdAt: string;
}

export function CreateShareModal({
  selectedIds,
  onClose,
  onCreated,
}: {
  selectedIds: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<'sponsor' | 'gallery'>('sponsor');
  const [password, setPassword] = useState('');
  const [watermark, setWatermark] = useState(false);
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const requirePassword = type === 'gallery';
  const submitDisabled = busy || (requirePassword && !password.trim());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    setBusy(true);
    setError(null);

    const body: CreateBody = {
      assetIds: selectedIds,
      type,
      watermark,
    };
    if (password.trim()) body.password = password.trim();
    const n = Number(limit);
    if (limit && Number.isInteger(n) && n > 0) body.allowedDownloads = n;

    try {
      const res = await fetch('/api/share/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as (CreateResponse & { error?: string }) | null;
      if (!res.ok || !data || !data.url) {
        setError(data?.error ?? 'Could not create share link.');
        return;
      }
      setResult(data);
      onCreated();
    } catch (e) {
      console.error('[CreateShareModal] create failed', e);
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail on non-secure contexts; user can still copy by hand.
    }
  }

  const cardStyle = { background: 'var(--card)' } as const;
  const inputStyle = { background: 'var(--card)', borderColor: 'var(--border)' } as const;
  const labelClass = 'mb-1 block text-[12px] font-medium text-[var(--text-secondary)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 font-[family-name:var(--font-dm-sans)]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[12px] p-6"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {result ? 'Share link ready' : `Share ${selectedIds.length} ${selectedIds.length === 1 ? 'asset' : 'assets'}`}
            </h3>
            {!result && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Wraps the selection in a new folder, then mints the public link.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-[6px] p-1 hover:bg-[var(--raised)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div>
              <p className={labelClass}>Shareable URL</p>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={result.url}
                  className="flex-1 truncate rounded-[6px] border px-2 py-1.5 text-[13px]"
                  style={inputStyle}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12px] font-medium"
                  style={inputStyle}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <Link href="/operator/media/shares" className="underline-offset-2 hover:underline">
                Manage shares →
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-white"
                style={{ background: 'var(--primary)' }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className={labelClass}>Type</p>
              <div className="flex gap-2">
                {(['sponsor', 'gallery'] as const).map((value) => {
                  const active = type === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setType(value)}
                      className="flex-1 rounded-[6px] border px-3 py-2 text-[13px] capitalize"
                      style={{
                        background: active ? 'var(--primary)' : 'var(--card)',
                        color: active ? 'var(--primary-foreground)' : 'var(--text-primary)',
                        borderColor: active ? 'var(--primary)' : 'var(--border)',
                      }}
                    >
                      {value === 'sponsor' ? 'Sponsor delivery' : 'Member gallery'}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {type === 'sponsor'
                  ? 'A delivery URL for a sponsor — optional password.'
                  : 'A password-protected member gallery — password required.'}
              </p>
            </div>

            <div>
              <label htmlFor="share-password" className={labelClass}>
                Password {requirePassword ? '' : '(optional)'}
              </label>
              <input
                id="share-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[6px] border px-2 py-1.5 text-[13px]"
                style={inputStyle}
                placeholder={requirePassword ? 'Required' : 'Leave blank for open access'}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="share-limit" className={labelClass}>
                Download limit (optional)
              </label>
              <input
                id="share-limit"
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full rounded-[6px] border px-2 py-1.5 text-[13px]"
                style={inputStyle}
                placeholder="No limit"
              />
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Total downloads across all visitors. Enforced server-side.
              </p>
            </div>

            <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: 'var(--primary)' }}
              />
              Add visible watermark overlay
            </label>

            {error ? (
              <p className="text-[12px]" style={{ color: 'var(--primary)' }}>
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[6px] border px-3 py-1.5 text-[13px]"
                style={inputStyle}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="rounded-[6px] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--primary)' }}
              >
                {busy ? 'Creating…' : 'Create link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
