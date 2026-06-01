'use client';

import { useState } from 'react';

export function SponsorBriefBar() {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onGenerate() {
    if (busy) return;
    setBusy(true);
    setUrl(null);
    setMsg(null);
    try {
      const res = await fetch('/api/intelligence/audience-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (res.ok && data.ok && data.url) setUrl(data.url);
      else setMsg(data.error ?? 'Could not generate the brief.');
    } catch {
      setMsg('Could not generate the brief.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
      <div className="flex flex-wrap items-center justify-between gap-4 py-8">
        <div>
          <span className="text-[11px] uppercase" style={{ letterSpacing: '0.22em', color: 'var(--text-secondary)' }}>
            Sponsor Brief
          </span>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            A pre-sale Audience Intelligence Brief for your primary sponsor brand. Pick a specific sponsor in Recap Studio.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="btn-shimmer px-6 py-3 text-[11px] uppercase disabled:opacity-50"
          style={{ letterSpacing: '0.2em', background: 'var(--accent)', color: 'var(--on-primary)', borderRadius: '2px' }}
        >
          {busy ? 'Generating…' : 'Generate One-Sheeter'}
        </button>
      </div>

      {url && (
        <div className="mb-6 rounded-[4px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--raised)' }}>
          <p className="text-[11px] uppercase" style={{ letterSpacing: '0.2em', color: 'var(--text-secondary)' }}>Brief link</p>
          <p className="mt-2 break-all text-[13px]" style={{ color: 'var(--text-primary)' }}>{url}</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-[3px] px-4 py-2 text-[11px] uppercase" style={{ letterSpacing: '0.16em', background: 'var(--accent)', color: 'var(--on-primary)' }}>
            Open
          </a>
        </div>
      )}
      {msg && <p className="mb-6 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{msg}</p>}
    </>
  );
}
