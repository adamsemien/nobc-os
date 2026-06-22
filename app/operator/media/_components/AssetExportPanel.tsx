'use client';
import { useState } from 'react';
import { Link2, Copy, Check } from 'lucide-react';

interface PresetLink {
  key: string;
  label: string;
  url: string;
}

/**
 * Phase A UI — "Public link & export" controls in the asset preview side panel.
 * Mints a stable hotlink (GET /api/media/dam/asset/[id]/public-link) and offers a
 * copy button for the original plus each channel-resize preset. Photos only.
 */
export function AssetExportPanel({
  assetId,
  fileType,
}: {
  assetId: string;
  fileType: 'PHOTO' | 'VIDEO';
}) {
  const [loading, setLoading] = useState(false);
  const [base, setBase] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Public links are photo-only (the route resizes via Sharp).
  if (fileType !== 'PHOTO') return null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/dam/asset/${assetId}/public-link`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || `Failed (${res.status})`);
        return;
      }
      setBase(j.url ?? null);
      setPresets(Array.isArray(j.presets) ? j.presets : []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError('Copy failed — select and copy manually');
    }
  };

  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Public link &amp; export
      </div>

      {!base ? (
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 self-start rounded-[6px] border px-2.5 py-1.5 text-[13px] disabled:opacity-60"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Link2 className="h-4 w-4" />
          {loading ? 'Generating…' : 'Get public link'}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => copy(base, 'base')}
            className="flex items-center gap-2 rounded-[6px] border px-2.5 py-1.5 text-left text-[13px]"
            style={{
              borderColor: 'var(--border)',
              color: copied === 'base' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            {copied === 'base' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === 'base' ? 'Copied!' : 'Copy original link'}
          </button>

          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => copy(p.url, p.key)}
                title={`Copy a ${p.label} sized link`}
                className="rounded-[6px] border px-2 py-1 text-[12px]"
                style={{
                  borderColor: 'var(--border)',
                  color: copied === p.key ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {copied === p.key ? 'Copied!' : p.label}
              </button>
            ))}
          </div>

          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Paste into a newsletter or social post — links resize on the fly and never expire.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[12px]" style={{ color: 'var(--primary)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
