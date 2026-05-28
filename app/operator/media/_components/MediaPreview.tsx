'use client';
import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import type { MediaAsset } from './types';

export function formatBytes(n: number): string {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** Full-screen preview: full-res media + ←/→/ESC nav + editable metadata panel. */
export function MediaPreview({
  assets,
  index,
  onClose,
  onIndexChange,
  onAssetUpdated,
}: {
  assets: MediaAsset[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onAssetUpdated: (a: MediaAsset) => void;
}) {
  const asset = assets[index];
  const [tagText, setTagText] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < assets.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, assets.length, onClose, onIndexChange]);

  if (!asset) return null;

  const patch = async (
    data: Partial<Pick<MediaAsset, 'tags' | 'isSelect' | 'shooterCredit' | 'sponsorName'>>,
  ) => {
    try {
      const res = await fetch(`/api/media/dam/asset/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) onAssetUpdated({ ...asset, ...data } as MediaAsset);
      else console.error('[MediaPreview] patch failed', res.status);
    } catch (e) {
      console.error('[MediaPreview] patch error', e);
    }
  };

  const addTag = () => {
    const t = tagText.trim();
    if (t && !asset.tags.includes(t)) patch({ tags: [...asset.tags, t] });
    setTagText('');
  };

  const labelStyle = { color: 'var(--text-muted)' } as const;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/85">
      {index > 0 && (
        <button
          aria-label="Previous"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}
      {index < assets.length - 1 && (
        <button
          aria-label="Next"
          className="absolute right-[348px] top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/80 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      <div
        className="relative flex flex-1 items-center justify-center p-8"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <button
          aria-label="Close preview"
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <X className="h-6 w-6" />
        </button>
        {asset.fileType === 'VIDEO' ? (
          <video src={`/api/media/dam/asset/${asset.id}/full`} controls className="max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/dam/asset/${asset.id}/full`} alt={asset.filename} className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <aside
        className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto p-5 font-[family-name:var(--font-dm-sans)]"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-[18px] leading-tight" style={{ color: 'var(--text-primary)' }}>
            {asset.filename}
          </h2>
          <button aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <button
          className="flex items-center gap-2 self-start rounded-[6px] border px-2.5 py-1.5 text-[13px]"
          style={{ borderColor: 'var(--border)' }}
          onClick={() => patch({ isSelect: !asset.isSelect })}
        >
          <Star className="h-4 w-4" style={asset.isSelect ? { color: 'var(--primary)', fill: 'var(--primary)' } : undefined} />
          {asset.isSelect ? 'Selected' : 'Mark as select'}
        </button>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <dt>Dimensions</dt><dd>{asset.width ?? '—'} × {asset.height ?? '—'}</dd>
          <dt>Size</dt><dd>{formatBytes(asset.size)}</dd>
          <dt>Uploaded</dt><dd>{new Date(asset.createdAt).toLocaleDateString()}</dd>
          {asset.qualityScore != null && (<><dt>Quality</dt><dd>{Math.round(asset.qualityScore)}</dd></>)}
          {asset.sponsorName && (<><dt>Sponsor</dt><dd>{asset.sponsorName}</dd></>)}
          {asset.shooterCredit && (<><dt>Credit</dt><dd>{asset.shooterCredit}</dd></>)}
        </dl>

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>Tags</div>
          <div className="flex flex-wrap gap-1">
            {asset.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]" style={{ background: 'var(--raised)' }}>
                {t}
                <button onClick={() => patch({ tags: asset.tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
            placeholder="Add tag…"
            className="mt-2 w-full rounded-[6px] border px-2 py-1 text-[13px]"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        {asset.aiTags.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>AI tags</div>
            <div className="flex flex-wrap gap-1">
              {asset.aiTags.map((t) => (
                <span key={t} className="rounded-full px-2 py-0.5 text-[12px]" style={{ background: 'var(--raised)', color: 'var(--text-muted)' }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
