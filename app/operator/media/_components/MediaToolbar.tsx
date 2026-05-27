'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Grid3x3, Grid2x2, Square, Sparkles, Upload } from 'lucide-react';
import { useDensity, type Density } from './useDensity';
import { useUpload } from './UploadDropzone';

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

/** Search (debounced) + sort + density controls, top-right of the grid area. */
export function MediaToolbar({ onDensity }: { onDensity: (d: Density) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { open, isUploading } = useUpload();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [, setDensity] = useDensity();

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

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search media…"
          className="w-full rounded-[8px] border py-1.5 pl-8 pr-3 text-[13px]"
          style={ctlStyle}
        />
      </div>
      <select
        value={sp.get('sort') ?? 'date'}
        onChange={(e) => setSort(e.target.value)}
        className="rounded-[8px] border px-2 py-1.5 text-[13px]"
        style={ctlStyle}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
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
          color: sp.get('minQuality') ? '#fff' : undefined,
        }}
      >
        <Sparkles className="h-4 w-4" /> Top Picks
      </button>
      <div className="flex gap-1">
        {DENSITY_ICON.map(([d, Icon]) => (
          <button
            key={d}
            onClick={() => pickDensity(d)}
            aria-label={`${d} thumbnails`}
            className="rounded-[6px] border p-1.5"
            style={{ borderColor: 'var(--border)' }}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
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
