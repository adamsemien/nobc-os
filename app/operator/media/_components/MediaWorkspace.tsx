'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDensity } from './useDensity';
import { useViewMode } from './useViewMode';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { MediaList } from './MediaList';
import { FolderTree } from './FolderTree';
import { FilterPanel, type FilterOptions } from './FilterPanel';
import { BulkActionBar } from './BulkActionBar';
import { MediaPreview } from './MediaPreview';
import { UploadDropzone } from './UploadDropzone';
import type { MediaAsset } from './types';

/** Owns assets fetch, selection, preview, upload, and view-mode state across the
 *  DAM surfaces. Grid and list views are pure subscribers — switching between
 *  them never re-fetches and never resets selection. */
export function MediaWorkspace({ options }: { options: FilterOptions }) {
  const [density, setDensity] = useDensity();
  const [viewMode, setViewMode] = useViewMode();
  const sp = useSearchParams();
  const isTrash = sp.get('view') === 'trash';

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isWide, setIsWide] = useState(true);
  const lastClicked = useRef<number | null>(null);

  // Force grid mode below the md: breakpoint — the list view is desktop-only.
  // The user's saved preference is preserved in localStorage; we just ignore it
  // below 768px so the page renders the grid regardless of toggle state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Assets fetch — single source of truth for both grid and list. Re-fires
  // whenever the search/sort/filter URL changes or a bulk action calls onDone
  // (which bumps reloadKey).
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/media/dam/assets?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAssets(d.assets ?? []);
      })
      .catch((e) => {
        console.error('[MediaWorkspace] assets fetch failed', e);
        if (active) setAssets([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sp, reloadKey]);

  const reload = useCallback(() => {
    setSelection(new Set());
    setReloadKey((k) => k + 1);
  }, []);

  const onToggle = useCallback(
    (id: string, range: boolean) => {
      const idx = assets.findIndex((a) => a.id === id);
      setSelection((prev) => {
        const next = new Set(prev);
        if (range && lastClicked.current != null && idx >= 0) {
          const lo = Math.min(lastClicked.current, idx);
          const hi = Math.max(lastClicked.current, idx);
          for (let i = lo; i <= hi; i++) next.add(assets[i].id);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (idx >= 0) lastClicked.current = idx;
    },
    [assets],
  );

  const onAssetUpdated = useCallback((updated: MediaAsset) => {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const effectiveViewMode = isWide ? viewMode : 'grid';

  return (
    <div className="flex h-full w-full overflow-hidden">
      <FolderTree />
      <UploadDropzone onDone={reload}>
        <div className="flex h-full min-w-0 flex-col overflow-y-auto px-4">
          <MediaToolbar
            onDensity={setDensity}
            viewMode={viewMode}
            onViewMode={setViewMode}
          />
          {effectiveViewMode === 'list' ? (
            <MediaList
              assets={assets}
              loading={loading}
              selection={selection}
              onToggle={onToggle}
              onOpen={(i) => setPreviewIndex(i)}
            />
          ) : (
            <MediaGrid
              assets={assets}
              loading={loading}
              density={density}
              selection={selection}
              onToggle={onToggle}
              onOpen={(i) => setPreviewIndex(i)}
            />
          )}
        </div>
      </UploadDropzone>
      <FilterPanel options={options} />

      {selection.size > 0 && (
        <BulkActionBar
          selectedIds={[...selection]}
          isTrash={isTrash}
          onDone={reload}
          onClear={() => setSelection(new Set())}
        />
      )}

      {previewIndex != null && assets[previewIndex] && (
        <MediaPreview
          assets={assets}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
          onAssetUpdated={onAssetUpdated}
        />
      )}
    </div>
  );
}
