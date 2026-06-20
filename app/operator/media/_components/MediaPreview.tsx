'use client';
import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Star, Camera, Calendar, HelpCircle } from 'lucide-react';
import type { MediaAsset } from './types';
import type { ExifSummary } from '@/lib/dam/exif';

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

/** Full-screen preview: full-res media + ←/→/ESC nav + editable metadata panel.
 *
 *  Desktop (md+): metadata panel is a 340px right sidebar.
 *  Mobile: metadata panel is a scrollable bottom sheet below the image area. */
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
  const [exifData, setExifData] = useState<ExifSummary | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [similarAssets, setSimilarAssets] = useState<MediaAsset[]>([]);
  const [, setDetailLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const isDragging = useRef(false);

  // Fetch asset detail + similar on asset change
  useEffect(() => {
    if (!asset) return;
    setExifData(null);
    setPalette([]);
    setSimilarAssets([]);
    setDetailLoading(true);
    setTagText('');
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowPanel(true);

    Promise.all([
      fetch(`/api/media/dam/asset/${asset.id}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/media/dam/asset/${asset.id}/similar`).then((r) => r.json()).catch(() => null),
    ]).then(([detail, similar]) => {
      if (detail) {
        setExifData(detail.metadata ?? null);
        setPalette(detail.palette ?? []);
      }
      if (similar) {
        setSimilarAssets(similar.assets ?? []);
      }
      setDetailLoading(false);
    });
  }, [asset?.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
        else onClose();
      } else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < assets.length - 1) onIndexChange(index + 1);
      else if (e.key === 'f' || e.key === 'F') patch({ isSelect: !asset?.isSelect });
      else if (e.key === 'z' || e.key === 'Z') {
        if (zoom === 1) setZoom(2);
        else { setZoom(1); setPan({ x: 0, y: 0 }); }
      }
      else if (e.key === 'i' || e.key === 'I') setShowPanel((prev) => !prev);
      else if (e.key === '?') setShowShortcuts((prev) => !prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, assets.length, onClose, onIndexChange, zoom, asset?.isSelect]);

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

  const handleImageClick = () => {
    if (isDragging.current) return;
    if (zoom === 1) setZoom(2);
    else { setZoom(1); setPan({ x: 0, y: 0 }); }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom === 1) return;
    e.preventDefault();
    isDragging.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStart.current) return;
    isDragging.current = true;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  };

  const onMouseUp = () => {
    dragStart.current = null;
    // Reset isDragging after click event fires
    setTimeout(() => { isDragging.current = false; }, 0);
  };

  const labelStyle = { color: 'var(--text-muted)' } as const;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 md:flex-row">

      {/* Image / video area */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-6 pb-20 md:p-8 md:pb-20"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Close button */}
        <button
          aria-label="Close preview"
          className="absolute left-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white md:left-auto md:right-14"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <X className="h-6 w-6" />
        </button>

        {/* Help button */}
        <button
          aria-label="Keyboard shortcuts"
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(e) => { e.stopPropagation(); setShowShortcuts((p) => !p); }}
        >
          <HelpCircle className="h-5 w-5" />
        </button>

        {/* Prev / Next buttons */}
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
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/80 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}

        {asset.fileType === 'VIDEO' ? (
          <video src={`/api/media/dam/asset/${asset.id}/full`} controls className="max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/dam/asset/${asset.id}/full`}
            alt={asset.filename}
            className="max-h-full max-w-full object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragStart.current ? 'none' : 'transform 200ms ease',
              cursor: zoom === 1 ? 'zoom-in' : 'zoom-out',
              transformOrigin: 'center center',
            }}
            onClick={handleImageClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            draggable={false}
          />
        )}

        {/* Filmstrip */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8">
          {assets.slice(Math.max(0, index - 5), Math.min(assets.length, index + 6)).map((a, rel) => {
            const absIdx = Math.max(0, index - 5) + rel;
            const isCurrent = absIdx === index;
            return (
              <button
                key={a.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onIndexChange(absIdx); }}
                className="h-10 w-10 shrink-0 overflow-hidden rounded-[3px] transition-all"
                style={{
                  outline: isCurrent ? '2px solid white' : '2px solid transparent',
                  opacity: isCurrent ? 1 : 0.6,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/media/dam/asset/${a.id}/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>

        {/* Keyboard shortcuts overlay */}
        {showShortcuts && (
          <div
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70"
            onClick={() => setShowShortcuts(false)}
          >
            <div
              className="rounded-[12px] p-6 text-[13px]"
              style={{ background: 'var(--card)', color: 'var(--text-primary)', minWidth: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 font-[family-name:var(--font-display)] text-[16px]">Keyboard shortcuts</div>
              <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2" style={{ color: 'var(--text-secondary)' }}>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">← →</dt><dd>Navigate</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">ESC</dt><dd>Close / zoom out</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">F</dt><dd>Flag as select</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">Z</dt><dd>Toggle zoom</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">I</dt><dd>Toggle info panel</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">?</dt><dd>This help</dd>
              </dl>
              <button className="mt-4 text-[12px]" style={{ color: 'var(--text-muted)' }} onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
          </div>
        )}
      </div>

      {/* Metadata panel */}
      {showPanel && (
        <aside
          className="max-h-[45vh] w-full shrink-0 overflow-y-auto md:max-h-none md:w-[340px]"
          style={{ background: 'var(--card)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-4 p-5 font-[family-name:var(--font-dm-sans)]">
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

            {exifData && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>Capture details</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-[family-name:var(--font-mono)]" style={{ color: 'var(--text-secondary)' }}>
                  {exifData.camera && <><dt className="flex items-center gap-1"><Camera className="h-3 w-3" />Camera</dt><dd>{exifData.camera}</dd></>}
                  {exifData.lens && <><dt>Lens</dt><dd>{exifData.lens}</dd></>}
                  {exifData.iso && <><dt>ISO</dt><dd>{exifData.iso}</dd></>}
                  {exifData.aperture && <><dt>Aperture</dt><dd>{exifData.aperture}</dd></>}
                  {exifData.shutter && <><dt>Shutter</dt><dd>{exifData.shutter}</dd></>}
                  {exifData.focalLength && <><dt>Focal</dt><dd>{exifData.focalLength}</dd></>}
                  {exifData.megapixels && <><dt>MP</dt><dd>{exifData.megapixels.toFixed(1)}</dd></>}
                  {exifData.takenAt && <><dt className="flex items-center gap-1"><Calendar className="h-3 w-3" />Shot</dt><dd>{new Date(exifData.takenAt).toLocaleDateString()}</dd></>}
                </dl>
              </div>
            )}

            {palette.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>Colors</div>
                <div className="flex gap-1.5">
                  {palette.map((hex, i) => (
                    <div key={i} className="h-6 w-6 rounded-full" style={{ background: hex }} title={hex} />
                  ))}
                </div>
              </div>
            )}

            {similarAssets.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>More like this</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {similarAssets.slice(0, 12).map((sim) => (
                    <button
                      key={sim.id}
                      type="button"
                      className="h-16 w-16 shrink-0 overflow-hidden rounded-[4px]"
                      onClick={() => {
                        const idx = assets.findIndex((a) => a.id === sim.id);
                        if (idx >= 0) onIndexChange(idx);
                      }}
                      title={sim.filename}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/media/dam/asset/${sim.id}/thumb`} alt={sim.filename} className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        </aside>
      )}
    </div>
  );
}
