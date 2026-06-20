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
 *  Mobile: metadata panel is a scrollable bottom sheet below the image area.
 *
 *  Touch gestures (image area only, not the metadata aside):
 *  - Swipe left/right: navigate prev/next (disabled when zoomed)
 *  - Swipe down: dismiss (zoom === 1 only)
 *  - Pinch: zoom [1,5]
 *  - Double-tap: zoom 2.5× centred on tap point, or reset
 */
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
  // Mouse-drag state (desktop pan)
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const isDragging = useRef(false);

  // ------------------------------------------------------------------
  // Touch gesture state
  // ------------------------------------------------------------------
  interface TouchStart {
    x: number;
    y: number;
    time: number;
    isVertical?: boolean;
  }
  // Primary touch tracking (swipe + dismiss)
  const touchStartRef = useRef<TouchStart | null>(null);
  // Number of active touches (used to gate pinch vs swipe)
  const touchCountRef = useRef(0);
  // Pinch: initial distance and starting zoom level
  const pinchRef = useRef<{ startDist: number; startZoom: number; originX: number; originY: number } | null>(null);
  // Double-tap: tracks last tap for double-tap detection
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  // Swipe-down dismiss: live Y translation (for the spring animation)
  const [dismissY, setDismissY] = useState(0);
  // True while the slide-out animation is playing before onClose fires
  const [isDismissing, setIsDismissing] = useState(false);
  // Track current zoom+pan in a ref so touch handlers always have latest value
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;
  // Reduced-motion preference — checked once
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Focus the close button on mount for keyboard / screen-reader accessibility
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

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
    setDismissY(0);
    setIsDismissing(false);

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
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      if (e.key === 'Escape') {
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else onClose();
      } else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < assets.length - 1) onIndexChange(index + 1);
      else if (e.key === 'f' || e.key === 'F') patch({ isSelect: !asset?.isSelect });
      else if (e.key === 'z' || e.key === 'Z') {
        if (zoom === 1) setZoom(2);
        else {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      } else if (e.key === 'i' || e.key === 'I') setShowPanel((prev) => !prev);
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

  // ------------------------------------------------------------------
  // Desktop mouse pan handlers (unchanged)
  // ------------------------------------------------------------------

  const handleImageClick = () => {
    if (isDragging.current) return;
    if (zoom === 1) setZoom(2);
    else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
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
    setTimeout(() => {
      isDragging.current = false;
    }, 0);
  };

  // ------------------------------------------------------------------
  // Helper: distance between two touches
  // ------------------------------------------------------------------
  const touchDist = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  // ------------------------------------------------------------------
  // Touch handlers — attached to the image-area div only
  // ------------------------------------------------------------------

  const onImageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchCountRef.current = e.touches.length;

    if (e.touches.length === 2) {
      // Start pinch
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dist = touchDist(t0, t1);
      const originX = (t0.clientX + t1.clientX) / 2;
      const originY = (t0.clientY + t1.clientY) / 2;
      pinchRef.current = { startDist: dist, startZoom: zoomRef.current, originX, originY };
      touchStartRef.current = null; // disable swipe/dismiss while pinching
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const now = Date.now();

    // Double-tap detection
    const last = lastTapRef.current;
    if (
      last &&
      now - last.time < 300 &&
      Math.abs(touch.clientX - last.x) < 12 &&
      Math.abs(touch.clientY - last.y) < 12
    ) {
      // Double-tap: toggle zoom 1 ↔ 2.5 centred on tap
      lastTapRef.current = null;
      if (zoomRef.current === 1) {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const cx = touch.clientX - rect.left - rect.width / 2;
        const cy = touch.clientY - rect.top - rect.height / 2;
        setZoom(2.5);
        setPan({ x: -cx * 1.5, y: -cy * 1.5 });
      } else {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    lastTapRef.current = { x: touch.clientX, y: touch.clientY, time: now };

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: now,
    };
    setDismissY(0);
  };

  const onImageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    touchCountRef.current = e.touches.length;

    // Handle pinch
    if (e.touches.length === 2 && pinchRef.current) {
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dist = touchDist(t0, t1);
      const newZoom = Math.min(
        5,
        Math.max(1, pinchRef.current.startZoom * (dist / pinchRef.current.startDist)),
      );
      setZoom(newZoom);
      return;
    }

    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine intent if not yet set
    if (touchStartRef.current.isVertical === undefined) {
      if (absDx > 8 || absDy > 8) {
        touchStartRef.current = {
          ...touchStartRef.current,
          isVertical: absDy > absDx,
        };
      }
      return;
    }

    // Swipe down to dismiss (zoom === 1, vertical downward intent)
    if (touchStartRef.current.isVertical && zoomRef.current === 1 && dy > 0) {
      e.preventDefault(); // prevent page scroll during dismiss drag
      setDismissY(dy);
      return;
    }

    // Horizontal swipe nav (disabled when zoomed, when vertical intent)
    if (!touchStartRef.current.isVertical && zoomRef.current <= 1) {
      // Allow up to 24px rubber-band at boundaries
      const atStart = index === 0 && dx > 0;
      const atEnd = index === assets.length - 1 && dx < 0;
      if ((atStart || atEnd) && Math.abs(dx) > 24) {
        // Just do nothing — rubber-band capped at 24px
      }
      return; // don't prevent default here; let the onTouchEnd commit
    }

    // Pan when zoomed
    if (zoomRef.current > 1) {
      setPan((p) => ({
        x: p.x + (touch.clientX - touchStartRef.current!.x),
        y: p.y + (touch.clientY - touchStartRef.current!.y),
      }));
      touchStartRef.current = {
        ...touchStartRef.current,
        x: touch.clientX,
        y: touch.clientY,
      };
    }
  };

  const onImageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    touchCountRef.current = e.touches.length;

    // End pinch — snap to 1 if barely pinched
    if (pinchRef.current) {
      pinchRef.current = null;
      if (zoomRef.current < 1.1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;

    const changedTouch = e.changedTouches[0];
    if (!changedTouch) return;

    const dx = changedTouch.clientX - start.x;
    const dy = changedTouch.clientY - start.y;
    const dt = Date.now() - start.time;
    const velocityX = Math.abs(dx) / Math.max(dt, 1);
    const velocityY = dy / Math.max(dt, 1);

    // Swipe down commit
    if (start.isVertical && zoomRef.current === 1 && dy > 0) {
      const shouldClose = dismissY > 120 || velocityY > 0.5;
      if (shouldClose) {
        if (prefersReducedMotion) {
          setDismissY(0);
          onClose();
        } else {
          setIsDismissing(true);
          setDismissY(window.innerHeight);
          setTimeout(() => {
            setIsDismissing(false);
            setDismissY(0);
            onClose();
          }, 300);
        }
      } else {
        // Spring back
        setDismissY(0);
      }
      return;
    }

    // Swipe left/right nav
    if (!start.isVertical && zoomRef.current <= 1) {
      const shouldNav = Math.abs(dx) > 60 || velocityX > 0.3;
      if (shouldNav) {
        if (dx < 0 && index < assets.length - 1) {
          onIndexChange(index + 1);
        } else if (dx > 0 && index > 0) {
          onIndexChange(index - 1);
        }
      }
      setDismissY(0);
    }
  };

  const labelStyle = { color: 'var(--text-muted)' } as const;

  // Backdrop opacity: dims as user drags down to dismiss
  const backdropOpacity = Math.max(0, 1 - dismissY / 300);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${asset.filename}`}
      className="fixed inset-0 z-50 flex flex-col md:flex-row"
      style={{ background: `rgba(0,0,0,${(0.85 * backdropOpacity).toFixed(3)})` }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Image / video area                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-6 pb-20 md:p-8 md:pb-20"
        style={{
          transform: dismissY ? `translateY(${dismissY}px)` : undefined,
          transition:
            isDismissing
              ? 'transform 300ms cubic-bezier(0.32,0.72,0,1)'
              : dismissY === 0
                ? prefersReducedMotion
                  ? 'none'
                  : 'transform 200ms cubic-bezier(0.32,0.72,0,1)'
                : 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
        onTouchStart={onImageTouchStart}
        onTouchMove={onImageTouchMove}
        onTouchEnd={onImageTouchEnd}
      >
        {/* Close button */}
        <button
          ref={closeBtnRef}
          aria-label="Close preview"
          className="absolute left-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none md:left-auto md:right-14"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-6 w-6" />
        </button>

        {/* Help button */}
        <button
          aria-label="Keyboard shortcuts"
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none"
          onClick={(e) => {
            e.stopPropagation();
            setShowShortcuts((p) => !p);
          }}
        >
          <HelpCircle className="h-5 w-5" />
        </button>

        {/* Prev / Next buttons */}
        {index > 0 && (
          <button
            aria-label="Previous"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index - 1);
            }}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}
        {index < assets.length - 1 && (
          <button
            aria-label="Next"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index + 1);
            }}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}

        {asset.fileType === 'VIDEO' ? (
          <video
            src={`/api/media/dam/asset/${asset.id}/full`}
            controls
            className="max-h-full max-w-full"
          />
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
          {assets
            .slice(Math.max(0, index - 5), Math.min(assets.length, index + 6))
            .map((a, rel) => {
              const absIdx = Math.max(0, index - 5) + rel;
              const isCurrent = absIdx === index;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(absIdx);
                  }}
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-[3px] transition-all motion-reduce:transition-none"
                  style={{
                    outline: isCurrent ? '2px solid white' : '2px solid transparent',
                    opacity: isCurrent ? 1 : 0.6,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/dam/asset/${a.id}/thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
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
              <div className="mb-3 font-[family-name:var(--font-display)] text-[16px]">
                Keyboard shortcuts
              </div>
              <dl
                className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">← →</dt>
                <dd>Navigate</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">ESC</dt>
                <dd>Close / zoom out</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">F</dt>
                <dd>Flag as select</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">Z</dt>
                <dd>Toggle zoom</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">I</dt>
                <dd>Toggle info panel</dd>
                <dt className="font-[family-name:var(--font-mono)] text-[12px]">?</dt>
                <dd>This help</dd>
              </dl>
              <button
                className="mt-4 text-[12px]"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Metadata panel — touch-action: pan-y so internal scroll works on mobile */}
      {/* ------------------------------------------------------------------ */}
      {showPanel && (
        <aside
          className="max-h-[45vh] w-full shrink-0 overflow-y-auto md:max-h-none md:w-[340px]"
          style={{ background: 'var(--card)', touchAction: 'pan-y' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-4 p-5 font-[family-name:var(--font-dm-sans)]">
            <div className="flex items-start justify-between gap-2">
              <h2
                className="font-[family-name:var(--font-display)] text-[18px] leading-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {asset.filename}
              </h2>
              <button aria-label="Close" onClick={onClose}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              className="flex items-center gap-2 self-start rounded-[6px] border px-2.5 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => patch({ isSelect: !asset.isSelect })}
            >
              <Star
                className="h-4 w-4"
                style={
                  asset.isSelect
                    ? { color: 'var(--primary)', fill: 'var(--primary)' }
                    : undefined
                }
              />
              {asset.isSelect ? 'Selected' : 'Mark as select'}
            </button>

            <dl
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-[family-name:var(--font-mono)] text-[12px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <dt>Dimensions</dt>
              <dd>
                {asset.width ?? '—'} × {asset.height ?? '—'}
              </dd>
              <dt>Size</dt>
              <dd>{formatBytes(asset.size)}</dd>
              <dt>Uploaded</dt>
              <dd>{new Date(asset.createdAt).toLocaleDateString()}</dd>
              {asset.qualityScore != null && (
                <>
                  <dt>Quality</dt>
                  <dd>{Math.round(asset.qualityScore)}</dd>
                </>
              )}
              {asset.sponsorName && (
                <>
                  <dt>Sponsor</dt>
                  <dd>{asset.sponsorName}</dd>
                </>
              )}
              {asset.shooterCredit && (
                <>
                  <dt>Credit</dt>
                  <dd>{asset.shooterCredit}</dd>
                </>
              )}
            </dl>

            {exifData && (
              <div>
                <div
                  className="mb-1 text-[11px] uppercase tracking-wide"
                  style={labelStyle}
                >
                  Capture details
                </div>
                <dl
                  className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] font-[family-name:var(--font-mono)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {exifData.camera && (
                    <>
                      <dt className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        Camera
                      </dt>
                      <dd>{exifData.camera}</dd>
                    </>
                  )}
                  {exifData.lens && (
                    <>
                      <dt>Lens</dt>
                      <dd>{exifData.lens}</dd>
                    </>
                  )}
                  {exifData.iso && (
                    <>
                      <dt>ISO</dt>
                      <dd>{exifData.iso}</dd>
                    </>
                  )}
                  {exifData.aperture && (
                    <>
                      <dt>Aperture</dt>
                      <dd>{exifData.aperture}</dd>
                    </>
                  )}
                  {exifData.shutter && (
                    <>
                      <dt>Shutter</dt>
                      <dd>{exifData.shutter}</dd>
                    </>
                  )}
                  {exifData.focalLength && (
                    <>
                      <dt>Focal</dt>
                      <dd>{exifData.focalLength}</dd>
                    </>
                  )}
                  {exifData.megapixels && (
                    <>
                      <dt>MP</dt>
                      <dd>{exifData.megapixels.toFixed(1)}</dd>
                    </>
                  )}
                  {exifData.takenAt && (
                    <>
                      <dt className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Shot
                      </dt>
                      <dd>{new Date(exifData.takenAt).toLocaleDateString()}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            {palette.length > 0 && (
              <div>
                <div
                  className="mb-1 text-[11px] uppercase tracking-wide"
                  style={labelStyle}
                >
                  Colors
                </div>
                <div className="flex gap-1.5">
                  {palette.map((hex, i) => (
                    <div
                      key={i}
                      className="h-6 w-6 rounded-full"
                      style={{ background: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </div>
            )}

            {similarAssets.length > 0 && (
              <div>
                <div
                  className="mb-1 text-[11px] uppercase tracking-wide"
                  style={labelStyle}
                >
                  More like this
                </div>
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
                      <img
                        src={`/api/media/dam/asset/${sim.id}/thumb`}
                        alt={sim.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide" style={labelStyle}>
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {asset.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px]"
                    style={{ background: 'var(--raised)' }}
                  >
                    {t}
                    <button
                      onClick={() => patch({ tags: asset.tags.filter((x) => x !== t) })}
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTag();
                }}
                placeholder="Add tag…"
                className="mt-2 w-full rounded-[6px] border px-2 py-1 text-[13px]"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>

            {asset.aiTags.length > 0 && (
              <div>
                <div
                  className="mb-1 text-[11px] uppercase tracking-wide"
                  style={labelStyle}
                >
                  AI tags
                </div>
                <div className="flex flex-wrap gap-1">
                  {asset.aiTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2 py-0.5 text-[12px]"
                      style={{ background: 'var(--raised)', color: 'var(--text-muted)' }}
                    >
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
