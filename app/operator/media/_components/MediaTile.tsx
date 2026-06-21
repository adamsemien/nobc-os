'use client';
import { useRef, useState, type MouseEvent } from 'react';
import { Check, Star, Film, Play } from 'lucide-react';
import { BlurhashCanvas } from './BlurhashCanvas';

export interface TileAsset {
  id: string;
  filename: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  fileType: 'PHOTO' | 'VIDEO';
  isSelect: boolean;
}

/**
 * Fills its (FLIP-positioned) wrapper. BlurHash → thumbnail fade, hover scale +
 * metadata overlay, top-left select checkbox.
 *
 * Mobile: long-press (500ms) activates selection mode with haptic feedback.
 * In selectionMode: tap toggles selection instead of opening preview.
 * Desktop (isWide=true): all touch logic is skipped, behaviour unchanged.
 */
export function MediaTile({
  asset,
  selected,
  onToggleSelect,
  onOpen,
  isWide = true,
  selectionMode = false,
  onEnterSelectionMode,
}: {
  asset: TileAsset;
  selected: boolean;
  onToggleSelect: (e: MouseEvent) => void;
  onOpen: () => void;
  /** True on md+ viewport — disables mobile touch logic */
  isWide?: boolean;
  /** True when mobile long-press selection mode is active */
  selectionMode?: boolean;
  /** Called when long-press activates selection mode on mobile */
  onEnterSelectionMode?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  // Drives the bounce animation on checkbox when it transitions selected→unselected or vice-versa
  const [bouncing, setBouncing] = useState(false);
  // Visual press-scale feedback during long-press wind-up (mobile only)
  const [pressing, setPressing] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  // True after a long-press fires within this touch sequence — suppresses the
  // synthetic onClick that touchend would otherwise trigger.
  const longPressActivated = useRef(false);

  // ------------------------------------------------------------------
  // Long-press helpers
  // ------------------------------------------------------------------

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    setPressing(false);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isWide) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressActivated.current = false;
    setPressing(true);

    longPressTimer.current = setTimeout(() => {
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReduced) {
        navigator.vibrate?.(20);
      }
      longPressActivated.current = true;
      setPressing(false);
      onEnterSelectionMode?.();
      // Synthesise a minimal MouseEvent-compatible object
      const synth = {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        stopPropagation: () => {},
      } as unknown as MouseEvent;
      onToggleSelect(synth);
      setBouncing(true);
      setTimeout(() => setBouncing(false), 200);
      longPressTimer.current = null;
    }, 500);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isWide) return;
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      cancelLongPress();
    }
  };

  const onTouchEnd = () => {
    if (isWide) return;
    cancelLongPress();
  };

  const onTouchCancel = () => {
    if (isWide) return;
    cancelLongPress();
  };

  // ------------------------------------------------------------------
  // Click / tap handler
  // ------------------------------------------------------------------

  const handleTileClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Suppress click that fires immediately after a long-press on mobile
    if (!isWide && longPressActivated.current) {
      longPressActivated.current = false;
      return;
    }
    // In mobile selection mode, tap toggles instead of opening
    if (!isWide && selectionMode) {
      e.stopPropagation();
      onToggleSelect(e);
      setBouncing(true);
      setTimeout(() => setBouncing(false), 200);
      return;
    }
    onOpen();
  };

  const handleCheckboxClick = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(e);
    setBouncing(true);
    setTimeout(() => setBouncing(false), 200);
  };

  // Checkbox always visible on mobile when in selection mode or already selected
  const checkboxAlwaysVisible = (!isWide && selectionMode) || selected;
  // Larger checkbox on mobile for accessible 44px tap targets
  const checkboxSizeCls = isWide ? 'h-5 w-5' : 'h-[22px] w-[22px]';

  return (
    <div
      className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-[6px] ${
        isWide
          ? 'transition-transform duration-[180ms] ease-out hover:scale-[1.02] motion-reduce:transition-none'
          : ''
      }`}
      style={{
        background: 'var(--card)',
        boxShadow: selected ? '0 0 0 3px var(--primary)' : undefined,
        // Press-scale feedback on mobile (respect reduced-motion — no transform if reduced)
        transform: pressing && !isWide ? 'scale(0.96)' : undefined,
        transition: !isWide
          ? pressing
            ? 'transform 400ms ease'
            : 'transform 200ms ease'
          : undefined,
      }}
      onClick={handleTileClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {asset.blurhash && (
        <BlurhashCanvas
          hash={asset.blurhash}
          className="absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none"
          style={{ width: '100%', height: '100%', opacity: loaded ? 0 : 1 }}
        />
      )}
      <img
        src={`/api/media/dam/asset/${asset.id}/thumb`}
        alt={asset.filename}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-300 group-hover:brightness-105 motion-reduce:transition-none"
        style={{ opacity: loaded ? 1 : 0 }}
        draggable={false}
      />
      {selected && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 28%, transparent)' }}
        />
      )}
      {asset.fileType === 'VIDEO' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex items-center justify-center rounded-full bg-black/50 p-1.5">
            <Play className="h-4 w-4 fill-white text-white" />
          </span>
        </div>
      )}
      {/* Checkbox — on mobile, wrapped in a larger hit-target div */}
      <div
        className={`absolute left-2 top-2 z-10 ${!isWide ? '-m-3 p-3' : ''} flex items-center justify-center`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleCheckboxClick}
          aria-label={selected ? `Deselect ${asset.filename}` : `Select ${asset.filename}`}
          aria-pressed={selected}
          className={`flex items-center justify-center rounded-[5px] border motion-reduce:transition-none ${checkboxSizeCls} ${
            checkboxAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{
            background: selected ? 'var(--primary)' : 'rgba(255,255,255,0.85)',
            borderColor: 'var(--border)',
            // Bounce animation on select/deselect
            transform: bouncing ? 'scale(0.85)' : 'scale(1)',
            transition: bouncing
              ? 'transform 120ms cubic-bezier(0.34,1.56,0.64,1)'
              : 'transform 120ms ease, opacity 150ms ease',
          }}
        >
          {selected && <Check className="h-3.5 w-3.5" style={{ color: 'var(--primary-foreground)' }} />}
        </button>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none">
        {asset.isSelect && <Star className="h-3 w-3 shrink-0" style={{ color: '#fff', fill: '#fff' }} />}
        {asset.fileType === 'VIDEO' && <Film className="h-3 w-3 shrink-0" style={{ color: '#fff' }} />}
        <span className="truncate font-[family-name:var(--font-mono)] text-[12px] text-white">
          {asset.filename}
        </span>
      </div>
    </div>
  );
}
