'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Search,
  Grid3x3,
  Grid2x2,
  Square,
  Star,
  Upload,
  LayoutGrid,
  List,
  GripVertical,
  X,
  Clock,
  Bookmark,
} from 'lucide-react';
import { useDensity, type Density } from './useDensity';
import { useUpload } from './UploadDropzone';
import type { ViewMode } from './useViewMode';
import { useRecentSearches } from './useRecentSearches';
import { SaveSearchPopover } from './SaveSearchPopover';

const SORTS: { value: string; label: string; title: string }[] = [
  { value: 'date', label: 'Date', title: 'Sort by upload date' },
  { value: 'shootDate', label: 'Shoot date', title: 'Sort by when the photo was taken' },
  { value: 'event', label: 'Event', title: 'Group by event' },
  { value: 'sponsor', label: 'Sponsor', title: 'Group by sponsor' },
  { value: 'selects', label: 'Selects first', title: 'Show flagged photos at the top' },
  { value: 'quality', label: 'Quality', title: 'Sort by sharpness, exposure, and composition score' },
  { value: 'manual', label: 'Manual', title: 'Drag photos into your preferred order' },
];

const DENSITY_ICON: [Density, typeof Square][] = [
  ['small', Grid3x3],
  ['medium', Grid2x2],
  ['large', Square],
];

const VIEW_MODE_ICON: [ViewMode, typeof Square, string][] = [
  ['grid', LayoutGrid, 'Grid view'],
  ['list', List, 'List view'],
];

const EXAMPLE_CHIPS = [
  'people laughing',
  'crowd energy',
  'empty room',
  'close-up portrait',
  'outdoor moment',
  'night scene',
];

/** Search (debounced) + sort + view-mode + density controls, top of the grid area. */
export function MediaToolbar({
  onDensity,
  viewMode,
  onViewMode,
}: {
  onDensity: (d: Density) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { open, isUploading } = useUpload();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [density, setDensity] = useDensity();
  const [inputFocused, setInputFocused] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const { recents, push: pushRecent, clear: clearRecents } = useRecentSearches();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync q from URL on external navigation (e.g. saved-search click)
  useEffect(() => {
    setQ(sp.get('q') ?? '');
  }, [sp]);

  // Debounced URL push — always removes ?mode (unified search, no toggle)
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      next.delete('mode');
      if (q) next.set('q', q);
      else next.delete('q');
      router.push(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Dismiss recent-searches dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setInputFocused(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    setQ(trimmed);
    setInputFocused(false);
    setHighlightedIdx(-1);
    if (trimmed) pushRecent(trimmed);
  };

  const clearSearch = () => {
    setQ('');
    const next = new URLSearchParams(sp.toString());
    next.delete('q');
    next.delete('mode');
    router.push(`${pathname}?${next.toString()}`);
  };

  const ctlStyle = {
    borderColor: 'var(--border)',
    background: 'var(--card)',
    color: 'var(--text-primary)',
  } as const;

  const activeStyle = {
    borderColor: 'var(--primary)',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
  } as const;

  const hasMinQuality = Boolean(sp.get('minQuality'));
  const hasActiveSearch = Boolean(
    sp.get('q') ||
      sp.get('color') ||
      sp.get('sponsor') ||
      sp.get('tag') ||
      sp.get('fileType') ||
      sp.get('folderId') ||
      sp.get('eventId'),
  );

  const showRecents = inputFocused && !q && recents.length > 0;
  const showChips = !inputFocused && !q && !sp.get('q');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showRecents) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, recents.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault();
      submitSearch(recents[highlightedIdx]);
    } else if (e.key === 'Escape') {
      setInputFocused(false);
      setHighlightedIdx(-1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-3 md:gap-3">
      {/* ── Search input ── */}
      <div className="relative w-full min-w-0 flex-1 sm:max-w-md">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHighlightedIdx(-1);
          }}
          onFocus={() => setInputFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder='Search photos and videos — try "people laughing" or "empty venue"'
          aria-label="Search media"
          aria-expanded={showRecents}
          aria-haspopup="listbox"
          className="w-full rounded-[8px] border py-1.5 pl-8 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
          style={ctlStyle}
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Recent searches dropdown */}
        {showRecents && (
          <div
            ref={dropdownRef}
            role="listbox"
            aria-label="Recent searches"
            className="absolute left-0 right-0 top-full z-30 mt-1 rounded-[8px] p-2 shadow-lg"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div
              className="mb-1 px-2 py-1 text-[11px] uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              Recent searches
            </div>
            {recents.map((r, i) => (
              <div
                key={r}
                role="option"
                aria-selected={i === highlightedIdx}
                onClick={() => submitSearch(r)}
                className="flex cursor-pointer items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px]"
                style={{
                  color: 'var(--text-primary)',
                  background: i === highlightedIdx ? 'var(--raised)' : undefined,
                }}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                {r}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                clearRecents();
                setInputFocused(false);
              }}
              className="mt-1 w-full rounded-[5px] px-2 py-1 text-left text-[12px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Clear history
            </button>
          </div>
        )}
      </div>

      {/* Example chips — only when input empty, not focused, no active q */}
      {showChips && (
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Try searching for:
          </span>
          <ul role="list" className="flex flex-wrap gap-1.5">
            {EXAMPLE_CHIPS.map((chip) => (
              <li key={chip} role="listitem">
                <button
                  type="button"
                  aria-label={`Search for ${chip}`}
                  onClick={() => submitSearch(chip)}
                  className="rounded-full border px-2.5 py-1 text-[12px] transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
                  style={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {chip}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Best photos (was Top Picks) ── */}
      <button
        type="button"
        aria-label={hasMinQuality ? 'Showing best photos — click to show all' : 'Filter to best photos'}
        aria-pressed={hasMinQuality}
        title="Show only high-quality photos, scored automatically by sharpness, exposure, and composition."
        onClick={() => {
          const next = new URLSearchParams(sp.toString());
          if (hasMinQuality) next.delete('minQuality');
          else next.set('minQuality', '60');
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
        style={hasMinQuality ? activeStyle : ctlStyle}
      >
        <Star className="h-4 w-4" /> Best photos
      </button>

      {/* ── View mode ── */}
      <div className="hidden gap-1 md:flex">
        {VIEW_MODE_ICON.map(([m, Icon, label]) => {
          const active = m === viewMode;
          return (
            <button
              key={m}
              onClick={() => onViewMode(m)}
              aria-label={label}
              aria-pressed={active}
              className="rounded-[6px] border p-1.5 transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
              style={active ? activeStyle : ctlStyle}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* ── Sort ── */}
      <select
        value={sp.get('sort') ?? 'date'}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set('sort', e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        aria-label="Sort order"
        className="rounded-[8px] border py-1.5 pl-2.5 pr-6 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
        style={ctlStyle}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value} title={s.title}>
            {s.label}
          </option>
        ))}
      </select>

      {/* ── Density group ── */}
      {viewMode === 'grid' && (
        <div role="group" aria-label="Thumbnail size" className="hidden gap-1 md:flex">
          {DENSITY_ICON.map(([d, Icon]) => {
            const active = d === density;
            return (
              <button
                key={d}
                aria-label={`${d} thumbnails`}
                aria-pressed={active}
                onClick={() => {
                  setDensity(d);
                  onDensity(d);
                }}
                className="rounded-[6px] border p-1.5 transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
                style={active ? activeStyle : ctlStyle}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Drag-to-arrange hint — manual sort only */}
      {sp.get('sort') === 'manual' && (
        <span
          className="hidden items-center gap-1 text-[12px] md:flex"
          style={{ color: 'var(--text-muted)' }}
          aria-live="polite"
        >
          <GripVertical className="h-3.5 w-3.5" />
          Drag to arrange
        </span>
      )}

      {/* ── Upload ── */}
      <button
        type="button"
        aria-label="Upload photos or videos"
        title="Upload photos or videos"
        disabled={isUploading}
        onClick={open}
        className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-50 transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
        style={{ background: 'var(--primary)', borderColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <Upload className="h-4 w-4" />
        {isUploading ? 'Uploading…' : 'Upload'}
      </button>

      {/* ── Save search — visible only when a search/filter is active ── */}
      {hasActiveSearch && (
        <div className="relative">
          <button
            type="button"
            aria-label="Save current search as a view"
            title="Save this search as a view"
            onClick={() => setSaveOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-[2px] focus-visible:outline-[color:var(--primary)] focus-visible:outline-offset-2"
            style={saveOpen ? activeStyle : ctlStyle}
          >
            <Bookmark className="h-4 w-4" /> Save search
          </button>
          {saveOpen && (
            <SaveSearchPopover
              currentParams={sp.toString()}
              currentQ={sp.get('q') ?? ''}
              onClose={() => setSaveOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
