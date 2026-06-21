'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Reduced-motion check — evaluated once at module load; safe in 'use client' modules.
const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
import justifiedLayout from 'justified-layout';
import { useSearchParams } from 'next/navigation';
import { ImagePlus, Upload } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EmptyState } from '@/components/ui';
import { invert } from '@/lib/dam/flip';
import { MediaTile } from './MediaTile';
import { useUpload } from './UploadDropzone';
import type { MediaAsset } from './types';
import { ROW_HEIGHT, type Density } from './useDensity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// SortableTile — wraps a tile wrapper with useSortable (only rendered in manual mode)
// ---------------------------------------------------------------------------

function SortableTile({
  id,
  box,
  inWindow,
  isDraggingActive,
  children,
  tileRefCallback,
}: {
  id: string;
  box: Box;
  inWindow: boolean;
  isDraggingActive: boolean;
  children: React.ReactNode;
  tileRefCallback: (el: HTMLDivElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    position: 'absolute',
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    // dnd-kit applies transform during drag; we append opacity fade for the source tile.
    // Under reduced-motion both collapse to instant.
    transform: CSS.Transform.toString(transform),
    transition: prefersReducedMotion
      ? undefined
      : isDraggingActive
        ? [transition, 'opacity 160ms ease'].filter(Boolean).join(', ') || undefined
        : 'opacity 160ms ease',
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
    touchAction: 'none',
  };

  if (!inWindow && !isDragging) return null;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        tileRefCallback(el);
      }}
      style={style}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marquee rectangle
// ---------------------------------------------------------------------------

interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Justified grid with selection, FLIP transitions, drag-to-rearrange (manual sort),
 *  and marquee select on the grid background. */
export function MediaGrid({
  assets,
  loading,
  density,
  selection,
  onToggle,
  onOpen,
  onReorder,
  sortMode,
  loadingMore = false,
  isWide = true,
  selectionMode = false,
  onEnterSelectionMode,
}: {
  assets: MediaAsset[];
  loading: boolean;
  density: Density;
  selection: Set<string>;
  onToggle: (id: string, additive: boolean) => void;
  onOpen: (index: number) => void;
  /** Called with the full new ordered id list when user finishes a drag. Only fires in manual mode. */
  onReorder?: (orderedIds: string[]) => void;
  /** Current sort mode — drag is only active when 'manual'. */
  sortMode?: string;
  loadingMore?: boolean;
  /** True on md+ viewport — passed through to MediaTile to gate mobile touch logic */
  isWide?: boolean;
  /** True when mobile long-press selection mode is active */
  selectionMode?: boolean;
  /** Called when long-press activates selection mode on mobile */
  onEnterSelectionMode?: () => void;
}) {
  const isManual = sortMode === 'manual';

  const sp = useSearchParams();
  const { open } = useUpload();
  const isTrash = sp.get('view') === 'trash';
  const query = sp.get('q')?.trim() ?? '';
  const isSemantic = sp.get('mode') === 'semantic';
  const searchActive = Boolean(
    query || sp.get('color') || sp.get('eventId') || sp.get('sponsor') || sp.get('tag') || sp.get('fileType'),
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(800);
  const ref = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPos = useRef<Map<string, { top: number; left: number }>>(new Map());

  // Active drag id — used to skip FLIP on dragged tile
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Marquee state
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // dnd-kit sensors: PointerSensor with 8px activation distance prevents
  // accidental drags on click; KeyboardSensor for a11y.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // ResizeObserver for container width
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Walk up DOM for scroll container
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let parent: HTMLElement | null = el.parentElement;
    while (parent && parent !== document.documentElement) {
      const overflow = window.getComputedStyle(parent).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') break;
      parent = parent.parentElement;
    }
    if (!parent) return;
    const scrollEl = parent;
    setViewH(scrollEl.clientHeight);
    const onScroll = () => setScrollTop(scrollEl.scrollTop);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewH(scrollEl.clientHeight));
    ro.observe(scrollEl);
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const layout = useMemo(() => {
    if (!containerWidth) return null;
    return justifiedLayout(
      assets.map((a) => ({ width: a.width ?? 4, height: a.height ?? 3 })),
      { containerWidth, targetRowHeight: ROW_HEIGHT[density], boxSpacing: 8 },
    );
  }, [assets, containerWidth, density]);

  // FLIP: skip during active drag (dnd-kit owns the transform then)
  useLayoutEffect(() => {
    if (!layout || activeDragId) return;
    const next = new Map<string, { top: number; left: number }>();
    assets.forEach((a, i) => {
      const bx = layout.boxes[i];
      if (bx) next.set(a.id, { top: bx.top, left: bx.left });
    });
    for (const [id, np] of next) {
      const el = tileRefs.current.get(id);
      const op = prevPos.current.get(id);
      if (el && op) {
        const { dx, dy } = invert(op, np);
        if (dx || dy) {
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = prefersReducedMotion ? 'none' : 'transform 220ms ease';
            el.style.transform = '';
          });
        }
      }
    }
    prevPos.current = next;
  }, [layout, assets, activeDragId]);

  // ---------------------------------------------------------------------------
  // Marquee select — only starts on pointer-down on EMPTY background (not on a tile)
  // ---------------------------------------------------------------------------

  const onGridPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only start marquee if click is directly on the grid container (not on a tile child)
      if (e.target !== e.currentTarget) return;
      // Only primary button
      if (e.button !== 0) return;
      // Bail in manual/drag mode — pointer could be a drag start
      if (isManual) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top + scrollTop;
      marqueeStart.current = { x, y };
      setMarquee({ x, y, w: 0, h: 0 });
      el.setPointerCapture(e.pointerId);
    },
    [isManual, scrollTop],
  );

  const onGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marqueeStart.current) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top + scrollTop;
      const { x: sx, y: sy } = marqueeStart.current;
      setMarquee({
        x: Math.min(sx, cx),
        y: Math.min(sy, cy),
        w: Math.abs(cx - sx),
        h: Math.abs(cy - sy),
      });
    },
    [scrollTop],
  );

  const onGridPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!marqueeStart.current || !marquee || !layout) {
        marqueeStart.current = null;
        setMarquee(null);
        return;
      }
      // Only commit marquee selection if it has meaningful size (avoid accidental clicks)
      if (marquee.w > 4 && marquee.h > 4) {
        const selected: string[] = [];
        assets.forEach((a, i) => {
          const bx = layout.boxes[i];
          if (!bx) return;
          if (rectsOverlap(marquee.x, marquee.y, marquee.w, marquee.h, bx.left, bx.top, bx.width, bx.height)) {
            selected.push(a.id);
          }
        });
        // Add intersecting tiles to selection (additive marquee)
        selected.forEach((id) => onToggle(id, true));
      }
      marqueeStart.current = null;
      setMarquee(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [marquee, layout, assets, onToggle],
  );

  // ---------------------------------------------------------------------------
  // dnd-kit drag handlers
  // ---------------------------------------------------------------------------

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    document.body.style.cursor = 'grabbing';
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      document.body.style.cursor = '';
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // computeReorder is imported lazily to avoid module-level import cost
      import('@/lib/dam/reorder').then(({ computeReorder }) => {
        const orderedIds = assets.map((a) => a.id);
        const { orderedIds: next } = computeReorder(orderedIds, String(active.id), String(over.id));
        onReorder?.(next);
      }).catch((err) => {
        console.error('[MediaGrid] reorder import failed', err);
      });
    },
    [assets, onReorder],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    document.body.style.cursor = '';
  }, []);

  // ---------------------------------------------------------------------------
  // Active drag asset (for DragOverlay ghost)
  // ---------------------------------------------------------------------------
  const activeDragAsset = activeDragId ? assets.find((a) => a.id === activeDragId) : null;
  const activeDragBox = activeDragId
    ? layout?.boxes[assets.findIndex((a) => a.id === activeDragId)] ?? null
    : null;

  const overscan = viewH * 1.5;
  const sortableIds = useMemo(() => assets.map((a) => a.id), [assets]);

  // ---------------------------------------------------------------------------
  // Inner tile list — shared between manual and non-manual render
  // ---------------------------------------------------------------------------

  const tileList = layout
    ? assets.map((a, i) => {
        const bx = layout.boxes[i];
        if (!bx) return null;
        const inWindow =
          bx.top + bx.height > scrollTop - overscan && bx.top < scrollTop + viewH + overscan;

        const tileRefCallback = (el: HTMLDivElement | null) => {
          if (el) tileRefs.current.set(a.id, el);
          else tileRefs.current.delete(a.id);
        };

        const tileContent = (
          <MediaTile
            asset={a}
            selected={selection.has(a.id)}
            onToggleSelect={(e) => onToggle(a.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            onOpen={() => onOpen(i)}
            isWide={isWide}
            selectionMode={selectionMode}
            onEnterSelectionMode={onEnterSelectionMode}
          />
        );

        if (isManual) {
          return (
            <SortableTile
              key={a.id}
              id={a.id}
              box={bx}
              inWindow={inWindow}
              isDraggingActive={activeDragId !== null}
              tileRefCallback={tileRefCallback}
            >
              {tileContent}
            </SortableTile>
          );
        }

        if (!inWindow) return null;
        return (
          <div
            key={a.id}
            ref={tileRefCallback}
            className="absolute"
            style={{ top: bx.top, left: bx.left, width: bx.width, height: bx.height }}
          >
            {tileContent}
          </div>
        );
      })
    : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const gridContent = (
    <div
      ref={ref}
      className="relative w-full pb-12"
      onPointerDown={onGridPointerDown}
      onPointerMove={onGridPointerMove}
      onPointerUp={onGridPointerUp}
    >
      {!loading && assets.length === 0 && isTrash && (
        <EmptyState title="Trash is empty" subtitle="Deleted media appears here for 30 days." />
      )}
      {!loading && assets.length === 0 && !isTrash && searchActive && (
        <EmptyState
          title={
            isSemantic && query
              ? `No vibes matched "${query}"`
              : query
                ? `No media matches "${query}"`
                : 'No media matches these filters'
          }
          subtitle={
            isSemantic && query
              ? 'Try fewer or simpler words, or switch to Keyword search.'
              : 'Try a different search or clear your filters.'
          }
        />
      )}
      {!loading && assets.length === 0 && !isTrash && !searchActive && (
        <button
          type="button"
          onClick={open}
          className="group mx-auto mt-10 flex w-full max-w-xl flex-col items-center gap-4 rounded-[18px] border-2 border-dashed px-8 py-16 text-center transition-colors hover:border-[color:var(--primary)]"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
          >
            <ImagePlus className="h-7 w-7" style={{ color: 'var(--primary)' }} />
          </span>
          <span
            className="font-[family-name:var(--font-display)] text-[26px] leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Drag photos &amp; folders here
          </span>
          <span className="font-[family-name:var(--font-dm-sans)] text-[14px]" style={{ color: 'var(--text-muted)' }}>
            Drop anywhere on this page, paste from your clipboard, or
          </span>
          <span
            className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-[14px] font-medium"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Upload className="h-4 w-4" /> Browse files
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--text-muted)' }}>
            JPG · PNG · WebP — up to 50MB each
          </span>
        </button>
      )}
      {layout && (
        <div className="relative" style={{ height: layout.containerHeight }}>
          {tileList}
        </div>
      )}

      {/* Marquee selection rectangle */}
      {marquee && marquee.w > 4 && marquee.h > 4 && (
        <div
          ref={marqueeRef}
          className="pointer-events-none absolute"
          style={{
            left: marquee.x,
            top: marquee.y - scrollTop,
            width: marquee.w,
            height: marquee.h,
            border: '1px solid var(--primary)',
            background: 'var(--primary-soft)',
            borderRadius: '3px',
            zIndex: 40,
          }}
        />
      )}

      {loadingMore && (
        <div className="flex gap-2 pt-2 pb-6">
          {[1, 2, 3].map((k) => (
            <div
              key={k}
              className="h-[160px] flex-1 animate-pulse rounded-[6px]"
              style={{ background: 'var(--raised)' }}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!isManual) {
    return gridContent;
  }

  // Manual sort: wrap in DndContext + SortableContext
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => {
            const filename = assets.find((a) => a.id === active.id)?.filename ?? String(active.id);
            const pos = assets.findIndex((a) => a.id === active.id) + 1;
            return `${filename} grabbed. Current position: ${pos} of ${assets.length}. Use arrow keys to move.`;
          },
          onDragOver: ({ active, over }) => {
            if (!over) return '';
            const filename = assets.find((a) => a.id === active.id)?.filename ?? String(active.id);
            const pos = assets.findIndex((a) => a.id === over.id) + 1;
            return `${filename} moved to position ${pos} of ${assets.length}.`;
          },
          onDragEnd: ({ active, over }) => {
            const filename = assets.find((a) => a.id === active.id)?.filename ?? String(active.id);
            if (!over) return `Reorder cancelled. ${filename} returned to position ${assets.findIndex((a) => a.id === active.id) + 1}.`;
            const pos = assets.findIndex((a) => a.id === over.id) + 1;
            return `${filename} dropped at position ${pos}. Order saved.`;
          },
          onDragCancel: ({ active }) => {
            const filename = assets.find((a) => a.id === active.id)?.filename ?? String(active.id);
            const pos = assets.findIndex((a) => a.id === active.id) + 1;
            return `Reorder cancelled. ${filename} returned to position ${pos}.`;
          },
        },
      }}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        {gridContent}
      </SortableContext>
      <DragOverlay
        dropAnimation={
          prefersReducedMotion
            ? null
            : { duration: 200, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }
        }
      >
        {activeDragAsset && activeDragBox ? (
          <div
            className="overflow-hidden rounded-[6px]"
            style={{
              width: activeDragBox.width,
              height: activeDragBox.height,
              opacity: 0.92,
              transform: 'scale(1.04) rotate(1.5deg)',
              transformOrigin: 'top left',
              boxShadow: '0 16px 48px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.14)',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              outline: '2px solid var(--primary)',
              cursor: 'grabbing',
              animation: prefersReducedMotion ? undefined : 'dam-lift 160ms cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            <img
              src={`/api/media/dam/asset/${activeDragAsset.id}/thumb`}
              alt={activeDragAsset.filename}
              className="h-full w-full object-cover"
              style={{ pointerEvents: 'none' }}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
