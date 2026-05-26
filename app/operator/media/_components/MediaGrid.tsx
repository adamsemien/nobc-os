'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import justifiedLayout from 'justified-layout';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/ui';
import { MediaTile, type TileAsset } from './MediaTile';
import { ROW_HEIGHT, type Density } from './useDensity';

/** The justified photo grid: param-driven fetch + Flickr justified-layout. */
export function MediaGrid({ density }: { density: Density }) {
  const sp = useSearchParams();
  const [assets, setAssets] = useState<TileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

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
        if (active) setAssets(d.assets ?? []);
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
  }, [sp]);

  const layout = useMemo(() => {
    if (!containerWidth) return null;
    return justifiedLayout(
      assets.map((a) => ({ width: a.width ?? 4, height: a.height ?? 3 })),
      { containerWidth, targetRowHeight: ROW_HEIGHT[density], boxSpacing: 8 },
    );
  }, [assets, containerWidth, density]);

  return (
    <div ref={ref} className="relative w-full pb-12">
      {!loading && assets.length === 0 && (
        <EmptyState title="No media" subtitle="Upload photos to get started." />
      )}
      {layout && (
        <div className="relative" style={{ height: layout.containerHeight }}>
          {assets.map((a, i) =>
            layout.boxes[i] ? <MediaTile key={a.id} asset={a} box={layout.boxes[i]} /> : null,
          )}
        </div>
      )}
    </div>
  );
}
