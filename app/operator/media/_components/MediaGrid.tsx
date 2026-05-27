'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import justifiedLayout from 'justified-layout';
import { useSearchParams } from 'next/navigation';
import { ImagePlus, Upload } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { invert } from '@/lib/dam/flip';
import { MediaTile } from './MediaTile';
import { useUpload } from './UploadDropzone';
import type { MediaAsset } from './types';
import { ROW_HEIGHT, type Density } from './useDensity';

/** Justified grid with selection, click-to-open, and hand-rolled FLIP transitions. */
export function MediaGrid({
  density,
  selection,
  onToggle,
  onOpen,
  onAssetsChange,
  reloadKey,
}: {
  density: Density;
  selection: Set<string>;
  onToggle: (id: string, additive: boolean) => void;
  onOpen: (index: number) => void;
  onAssetsChange?: (assets: MediaAsset[]) => void;
  reloadKey: number;
}) {
  const sp = useSearchParams();
  const { open } = useUpload();
  const isTrash = sp.get('view') === 'trash';
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPos = useRef<Map<string, { top: number; left: number }>>(new Map());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/media/dam/assets?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const a: MediaAsset[] = d.assets ?? [];
        setAssets(a);
        onAssetsChange?.(a);
      })
      .catch((e) => {
        console.error('[MediaGrid] fetch failed', e);
        if (active) setAssets([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, reloadKey]);

  const layout = useMemo(() => {
    if (!containerWidth) return null;
    return justifiedLayout(
      assets.map((a) => ({ width: a.width ?? 4, height: a.height ?? 3 })),
      { containerWidth, targetRowHeight: ROW_HEIGHT[density], boxSpacing: 8 },
    );
  }, [assets, containerWidth, density]);

  // FLIP: animate each tile wrapper from its old position to the new one.
  useLayoutEffect(() => {
    if (!layout) return;
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
            el.style.transition = 'transform 220ms ease';
            el.style.transform = '';
          });
        }
      }
    }
    prevPos.current = next;
  }, [layout, assets]);

  return (
    <div ref={ref} className="relative w-full pb-12">
      {!loading && assets.length === 0 && isTrash && (
        <EmptyState title="Trash is empty" subtitle="Deleted media appears here for 30 days." />
      )}
      {!loading && assets.length === 0 && !isTrash && (
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
          {assets.map((a, i) => {
            const bx = layout.boxes[i];
            if (!bx) return null;
            return (
              <div
                key={a.id}
                ref={(el) => {
                  if (el) tileRefs.current.set(a.id, el);
                  else tileRefs.current.delete(a.id);
                }}
                className="absolute"
                style={{ top: bx.top, left: bx.left, width: bx.width, height: bx.height }}
              >
                <MediaTile
                  asset={a}
                  selected={selection.has(a.id)}
                  onToggleSelect={(e) => onToggle(a.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                  onOpen={() => onOpen(i)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
