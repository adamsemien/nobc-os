'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Folders } from 'lucide-react';
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
import { classifyColor } from '@/lib/dam/color';
import type { MediaAsset } from './types';

/** Owns assets fetch, selection, preview, upload, view-mode, and reorder state
 *  across the DAM surfaces. Grid and list views are pure subscribers — switching
 *  between them never re-fetches and never resets selection. */
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
  const lastClicked = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Assets fetch — resets on sp/reloadKey change, handles semantic mode
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAssets([]);
    setNextCursor(null);
    setIsDegraded(false);

    const isSemantic = sp.get('mode') === 'semantic';
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

    if (isSemantic && q) {
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
          const isSemantic = sp.get('mode') === 'semantic';
          const q = sp.get('q') ?? '';
          let url: string;
          if (isSemantic && q) {
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
              // Dedupe: infinite-scroll appends must not duplicate already-loaded ids
              setAssets((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const fresh = (d.assets ?? []).filter((a: MediaAsset) => !existingIds.has(a.id));
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

  // Keyboard: Esc clears selection; ⌘A / Ctrl+A selects all visible assets
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(new Set());
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // Only intercept if the user isn't focused in a text input/textarea
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setSelection(new Set(displayAssetsRef.current.map((a) => a.id)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    setSelection(new Set());
    setReloadKey((k) => k + 1);
  }, []);

  /** Toggle selection. Called from:
   *  - Checkbox click (always additive-mode: true for ⌘/shift; false for plain click)
   *  - Marquee drag (additive = true — always adds, never removes on marquee)
   *
   *  Existing behavior:
   *    - shift = range select from lastClicked to idx
   *    - meta/ctrl = toggle single without changing others (additive=true but range=false implied by the else branch)
   *  This matches existing onToggle semantics from MediaGrid's:
   *    onToggle(a.id, e.shiftKey || e.metaKey || e.ctrlKey)
   *  shift → range; meta/ctrl → single toggle (existing "else if next.has" branch handles it)
   */
  const onToggle = useCallback(
    (id: string, range: boolean) => {
      const idx = assets.findIndex((a) => a.id === id);
      setSelection((prev) => {
        const next = new Set(prev);
        if (range && lastClicked.current != null && idx >= 0) {
          // shift-click: range add
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

  // Optimistic reorder: update local assets array immediately, then persist
  const onReorder = useCallback(
    (orderedIds: string[]) => {
      // Build a lookup from id → asset for the current list
      const byId = new Map(assets.map((a) => [a.id, a]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as MediaAsset[];
      setAssets(reordered);

      // Persist via the existing bulk 'reorder' endpoint
      fetch('/api/media/dam/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          assetIds: orderedIds,
          orderedIds,
        }),
      })
        .then((r) => {
          if (!r.ok) console.error('[MediaWorkspace] reorder persist failed', r.status);
        })
        .catch((e) => console.error('[MediaWorkspace] reorder persist error', e));
    },
    [assets],
  );

  const onAssetUpdated = useCallback((updated: MediaAsset) => {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const effectiveViewMode = isWide ? viewMode : 'grid';

  // Client-side color filter
  const colorFilter = sp.get('color') ?? '';
  const displayAssets = colorFilter
    ? assets.filter((a) => (a.dominantColor ? classifyColor(a.dominantColor) === colorFilter : false))
    : assets;

  // Ref so the keyboard handler can read displayAssets without stale closure
  const displayAssetsRef = useRef<MediaAsset[]>(displayAssets);
  displayAssetsRef.current = displayAssets;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <FolderTree
        mobileOpen={folderDrawerOpen}
        onMobileClose={() => setFolderDrawerOpen(false)}
      />
      <UploadDropzone onDone={reload}>
        <div className="flex h-full min-w-0 flex-col overflow-y-auto px-3 md:px-4">
          {/* Mobile folder button — visible only below md breakpoint */}
          <div className="flex items-center gap-2 pt-3 md:hidden">
            <button
              type="button"
              aria-label="Open folders"
              className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--text-secondary)' }}
              onClick={() => setFolderDrawerOpen(true)}
            >
              <Folders className="h-4 w-4" />
              Folders
            </button>
          </div>
          <MediaToolbar
            onDensity={setDensity}
            viewMode={viewMode}
            onViewMode={setViewMode}
          />
          {isDegraded && (
            <div
              className="mb-2 rounded-[6px] px-3 py-2 text-[13px]"
              style={{
                background: 'color-mix(in srgb, var(--primary) 8%, var(--card))',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Vibe search is warming up — showing keyword results
            </div>
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
            />
          )}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div
                className="h-5 w-5 animate-spin rounded-full border-2"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
              />
            </div>
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
