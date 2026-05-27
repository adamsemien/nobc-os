'use client';
import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDensity } from './useDensity';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { FolderTree } from './FolderTree';
import { FilterPanel, type FilterOptions } from './FilterPanel';
import { BulkActionBar } from './BulkActionBar';
import { MediaPreview } from './MediaPreview';
import { UploadDropzone } from './UploadDropzone';
import type { MediaAsset } from './types';

/** Owns selection, preview, upload, and reload state across the DAM grid surfaces. */
export function MediaWorkspace({ options }: { options: FilterOptions }) {
  const [density, setDensity] = useDensity();
  const sp = useSearchParams();
  const isTrash = sp.get('view') === 'trash';

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastClicked = useRef<number | null>(null);

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

  return (
    <div className="flex h-full w-full overflow-hidden">
      <FolderTree />
      <UploadDropzone onDone={reload}>
        <div className="flex h-full min-w-0 flex-col overflow-y-auto px-4">
          <MediaToolbar onDensity={setDensity} />
          <MediaGrid
            density={density}
            selection={selection}
            onToggle={onToggle}
            onOpen={(i) => setPreviewIndex(i)}
            onAssetsChange={setAssets}
            reloadKey={reloadKey}
          />
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
