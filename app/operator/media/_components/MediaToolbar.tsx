'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Grid3x3, Grid2x2, Square, Sparkles, Upload, LayoutGrid, List, GripVertical, Clapperboard } from 'lucide-react';
import { useDensity, type Density } from './useDensity';
import { useUpload } from './UploadDropzone';
import type { ViewMode } from './useViewMode';

const SORTS: { value: string; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'event', label: 'Event' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'fileType', label: 'File type' },
  { value: 'selects', label: 'Selects first' },
  { value: 'quality', label: 'Quality' },
  { value: 'manual', label: 'Manual' },
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

/** Search (debounced) + sort + view-mode + density controls, top-right of the grid area. */
export function MediaToolbar({
  onDensity,
  viewMode,
  onViewMode,
  onCreateStory,
}: {
  onDensity: (d: Density) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  onCreateStory?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { open, isUploading } = useUpload();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [density, setDensity] = useDensity();

  const isSemantic = sp.get('mode') === 'semantic';

  const toggleMode = () => {
    const next = new URLSearchParams(sp.toString());
    if (isSemantic) next.delete('mode');
    else next.set('mode', 'semantic');
    router.push(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (q) next.set('q', q);
      else next.delete('q');
      router.push(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setSort = (value: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set('sort', value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const pickDensity = (d: Density) => {
    setDensity(d);
    onDensity(d);
  };

  const ctlStyle = { borderColor: 'var(--border)', background: 'var(--card)' } as const;
  const activeStyle = {
    borderColor: 'var(--primary)',
    background: 'color-mix(in srgb, var(--primary) 12%, var(--card))',
    color: 'var(--primary)',
  } as const;

  return (
    <div className="flex flex-wrap items-center gap-2 py-3 md:gap-3">
      <div className="relative w-full min-w-0 flex-1 sm:max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isSemantic ? 'Describe a vibe…' : 'Search media…'}
          className="w-full rounded-[8px] border py-1.5 pl-8 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
          style={ctlStyle}
        />
      </div>
      <button
        type="button"
        aria-pressed={isSemantic}
        onClick={toggleMode}
        className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px]"
        style={isSemantic ? activeStyle : ctlStyle}
      >
        <Sparkles className="h-4 w-4" /> Vibe
      </button>
      {isSemantic ? (
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Sorted by relevance</span>
      ) : (
        <select
          value={sp.get('sort') ?? 'date'}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-[8px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
          style={ctlStyle}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        aria-pressed={!!sp.get('minQuality')}
        onClick={() => {
          const next = new URLSearchParams(sp.toString());
          if (sp.get('minQuality')) next.delete('minQuality');
          else next.set('minQuality', '75');
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[13px]"
        style={{
          borderColor: 'var(--border)',
          background: sp.get('minQuality') ? 'var(--primary)' : 'var(--card)',
          color: sp.get('minQuality') ? 'var(--primary-foreground)' : undefined,
        }}
      >
        <Sparkles className="h-4 w-4" /> Top Picks
      </button>
      <div className="hidden gap-1 md:flex">
        {VIEW_MODE_ICON.map(([m, Icon, label]) => {
          const active = m === viewMode;
          return (
            <button
              key={m}
              onClick={() => onViewMode(m)}
              aria-label={label}
              aria-pressed={active}
              className="rounded-[6px] border p-1.5 transition-colors"
              style={active ? activeStyle : { borderColor: 'var(--border)' }}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      {viewMode === 'grid' && (
        <div className="hidden gap-1 md:flex">
          {DENSITY_ICON.map(([d, Icon]) => {
            const active = d === density;
            return (
              <button
                key={d}
                onClick={() => pickDensity(d)}
                aria-label={`${d} thumbnails`}
                aria-pressed={active}
                className="rounded-[6px] border p-1.5 transition-colors"
                style={active ? activeStyle : { borderColor: 'var(--border)' }}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}
      {/* "Drag to arrange" hint — only shown in manual sort, desktop only */}
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
      {onCreateStory && (
        <button
          type="button"
          onClick={onCreateStory}
          className="flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13px] font-medium"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Clapperboard className="h-4 w-4" />
          Create Story
        </button>
      )}
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <Upload className="h-4 w-4" />
        {isUploading ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}
