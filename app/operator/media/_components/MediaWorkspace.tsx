'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Folders, SlidersHorizontal } from 'lucide-react';
import { useDensity } from './useDensity';
import { useViewMode } from './useViewMode';
import { toggleSelection, selectAll, clearSelection } from '@/lib/dam/selection';
import { MediaToolbar } from './MediaToolbar';
import { MediaGrid } from './MediaGrid';
import { MediaList } from './MediaList';
import { FolderTree } from './FolderTree';
import { FilterPanel, type FilterOptions } from './FilterPanel';
import { BulkActionBar } from './BulkActionBar';
import { MediaPreview } from './MediaPreview';
import { UploadDropzone } from './UploadDropzone';
import { classifyColor } from '@/lib/dam/color';
import type { MediaAsset } from './types';

export function MediaWorkspace({ options }: { options: FilterOptions }) {
  const [density, setDensity] = useDensity();
  const [viewMode, setViewMode] = useViewMode();
  const sp = useSearchParams();
  const isTrash = sp.get('view') === 'trash';
  const sortMode = sp.get('sort') ?? 'date';

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isWide, setIsWide] = useState(true);
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Mobile long-press selection mode — true when !isWide and user long-pressed a tile
  const [selectionMode, setSelectionMode] = useState(false);
  // Ref to focus the Cancel button when selectionMode becomes true
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const lastClicked = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Keep displayAssets in a ref so the ⌘A keyboard handler always has latest
  const displayAssetsRef = useRef<MediaAsset[]>([]);

  // Force grid mode below the md: breakpoint — the list view is desktop-only.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => {
      setIsWide(mq.matches);
      if (mq.matches) setFolderDrawerOpen(false);
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Auto-exit selectionMode when nothing is selected on mobile
  useEffect(() => {
    if (!isWide && selection.size === 0) {
      setSelectionMode(false);
    }
  }, [selection.size, isWide]);

  // Focus the Cancel button when selectionMode activates (accessibility)
  useEffect(() => {
    if (selectionMode && cancelBtnRef.current) {
      cancelBtnRef.current.focus();
    }
  }, [selectionMode]);

  // Assets fetch — resets on sp/reloadKey change.
  // When ?q is present, always tries semantic first and falls back transparently.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAssets([]);
    setNextCursor(null);
    setIsDegraded(false);

    const q = sp.get('q') ?? '';

    const doKeywordFetch = () =>
      fetch(`/api/media/dam/assets?${sp.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          setAssets(d.assets ?? []);
          setNextCursor(d.nextCursor ?? null);
        })
        .catch((e) => {
          console.error('[MediaWorkspace] assets fetch failed', e);
          if (active) setAssets([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    if (q) {
      const params = new URLSearchParams();
      params.set('q', q);
      const fileType = sp.get('fileType');
      const folderId = sp.get('folderId');
      const eventId = sp.get('eventId');
      if (fileType) params.set('fileType', fileType);
      if (folderId) params.set('folderId', folderId);
      if (eventId) params.set('eventId', eventId);

      fetch(`/api/media/dam/assets/semantic?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          if (d.degraded === true) {
            setIsDegraded(true);
            return doKeywordFetch();
          }
          setAssets(d.assets ?? []);
          setNextCursor(d.nextCursor ?? null);
          setLoading(false);
        })
        .catch((e) => {
          console.error('[MediaWorkspace] semantic fetch failed', e);
          if (active) return doKeywordFetch();
        });
    } else {
      doKeywordFetch();
    }

    return () => {
      active = false;
    };
  }, [sp, reloadKey]);

  // Infinite scroll via IntersectionObserver on sentinelRef
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor && !loading && !loadingMore) {
          setLoadingMore(true);
          const q = sp.get('q') ?? '';
          let url: string;
          if (q) {
            const params = new URLSearchParams();
            params.set('q', q);
            const fileType = sp.get('fileType');
            const folderId = sp.get('folderId');
            const eventId = sp.get('eventId');
            if (fileType) params.set('fileType', fileType);
            if (folderId) params.set('folderId', folderId);
            if (eventId) params.set('eventId', eventId);
            params.set('cursor', nextCursor);
            url = `/api/media/dam/assets/semantic?${params.toString()}`;
          } else {
            const params = new URLSearchParams(sp.toString());
            params.set('cursor', nextCursor);
            url = `/api/media/dam/assets?${params.toString()}`;
          }
          fetch(url)
            .then((r) => r.json())
            .then((d) => {
              setAssets((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const fresh = (d.assets ?? []).filter(
                  (a: MediaAsset) => !existingIds.has(a.id),
                );
                return [...prev, ...fresh];
              });
              setNextCursor(d.nextCursor ?? null);
            })
            .catch((e) => console.error('[MediaWorkspace] loadMore failed', e))
            .finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loading, loadingMore, sp]);

  // Keyboard: Esc clears selection (+ exits selectionMode); ⌘A / Ctrl+A selects all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(clearSelection());
        setSelectionMode(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setSelection(selectAll(displayAssetsRef.current.map((a) => a.id)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    setSelection(clearSelection());
    setSelectionMode(false);
    setReloadKey((k) => k + 1);
  }, []);

  const onToggle = useCallback(
    (id: string, range: boolean) => {
      const orderedIds = assets.map((a) => a.id);
      setSelection((prev) => {
        const { selection, nextAnchor } = toggleSelection(
          prev,
          id,
          range,
          orderedIds,
          lastClicked.current,
        );
        if (nextAnchor != null) lastClicked.current = nextAnchor;
        return selection;
      });
    },
    [assets],
  );

  const onReorder = useCallback(
    (orderedIds: string[]) => {
      const byId = new Map(assets.map((a) => [a.id, a]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter(Boolean) as MediaAsset[];
      setAssets(reordered);
      fetch('/api/media/dam/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', assetIds: orderedIds, orderedIds }),
      })
        .then((r) => {
          if (!r.ok)
            console.error('[MediaWorkspace] reorder persist failed', r.status);
        })
        .catch((e) => console.error('[MediaWorkspace] reorder persist error', e));
    },
    [assets],
  );

  const onAssetUpdated = useCallback((updated: MediaAsset) => {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const onEnterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  const effectiveViewMode = isWide ? viewMode : 'grid';

  const colorFilter = sp.get('color') ?? '';
  const displayAssets = colorFilter
    ? assets.filter((a) =>
        a.dominantColor ? classifyColor(a.dominantColor) === colorFilter : false,
      )
    : assets;

  displayAssetsRef.current = displayAssets;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <FolderTree
        mobileOpen={folderDrawerOpen}
        onMobileClose={() => setFolderDrawerOpen(false)}
      />
      <UploadDropzone onDone={reload}>
        <div className="flex h-full min-w-0 flex-col overflow-y-auto px-3 md:px-4">
          {/* Mobile sticky selection header — only visible in selectionMode on mobile */}
          {!isWide && selectionMode && (
            <div
              className="sticky top-0 z-20 flex items-center justify-between border-b px-3"
              style={{
                height: '48px',
                background: 'var(--card)',
                borderColor: 'var(--border)',
              }}
            >
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--primary)' }}
                aria-live="polite"
              >
                {selection.size} selected
              </span>
              <button
                ref={cancelBtnRef}
                type="button"
                className="rounded-[6px] px-3 py-1.5 text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => {
                  setSelection(new Set());
                  setSelectionMode(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Mobile top action bar: Folders + Filters buttons (md:hidden) */}
          <div className="flex items-center gap-2 pt-3 md:hidden">
            <button
              type="button"
              aria-label="Open folders"
              className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px]"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--text-secondary)',
              }}
              onClick={() => setFolderDrawerOpen(true)}
            >
              <Folders className="h-4 w-4" />
              Folders
            </button>
            <button
              type="button"
              aria-label="Open filters"
              className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px]"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--card)',
                color: 'var(--text-secondary)',
              }}
              onClick={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
          </div>

          <MediaToolbar onDensity={setDensity} viewMode={viewMode} onViewMode={setViewMode} />
          {isDegraded && (
            <p
              aria-live="polite"
              className="mb-2 text-[12px] italic"
              style={{ color: 'var(--text-muted)' }}
            >
              Showing keyword results — visual search is temporarily unavailable.
            </p>
          )}
          {effectiveViewMode === 'list' ? (
            <MediaList
              assets={displayAssets}
              loading={loading}
              selection={selection}
              onToggle={onToggle}
              onOpen={(i) => setPreviewIndex(i)}
            />
          ) : (
            <MediaGrid
              assets={displayAssets}
              loading={loading}
              density={density}
              selection={selection}
              onToggle={onToggle}
              onOpen={(i) => setPreviewIndex(i)}
              onReorder={onReorder}
              sortMode={sortMode}
              loadingMore={loadingMore}
              isWide={isWide}
              selectionMode={selectionMode}
              onEnterSelectionMode={onEnterSelectionMode}
            />
          )}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div
                className="h-5 w-5 animate-spin rounded-full border-2"
                style={{
                  borderColor: 'var(--border)',
                  borderTopColor: 'var(--primary)',
                }}
              />
            </div>
          )}
        </div>
      </UploadDropzone>
      <FilterPanel
        options={options}
        mobileOpen={filterSheetOpen}
        onMobileClose={() => setFilterSheetOpen(false)}
      />
      {selection.size > 0 && (
        <BulkActionBar
          selectedIds={[...selection]}
          isTrash={isTrash}
          onDone={reload}
          onClear={() => {
            setSelection(new Set());
            setSelectionMode(false);
          }}
          isWide={isWide}
          sponsors={options.sponsors}
        />
      )}
      {previewIndex != null && displayAssets[previewIndex] && (
        <MediaPreview
          assets={displayAssets}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
          onAssetUpdated={onAssetUpdated}
        />
      )}
    </div>
  );
}
