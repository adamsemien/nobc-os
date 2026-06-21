'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { COLOR_BUCKETS } from '@/lib/dam/color';

export interface FilterOptions {
  events: { id: string; title: string }[];
  sponsors: string[];
}

// ------------------------------------------------------------------
// Shared style constants
// ------------------------------------------------------------------

const lbl = 'mb-1 block text-[12px] font-medium uppercase tracking-wide';
const ctl = 'w-full rounded-[6px] border px-2 py-1.5 text-[13px]';
const ctlStyle = {
  borderColor: 'var(--border)',
  background: 'var(--card)',
  accentColor: 'var(--primary)',
} as const;
const lblStyle = { color: 'var(--text-secondary)' } as const;

// ------------------------------------------------------------------
// Inner component — extracted so both sidebar and sheet share the same JSX
// ------------------------------------------------------------------

function FilterControls({
  options,
  sp,
  set,
}: {
  options: FilterOptions;
  sp: ReturnType<typeof useSearchParams>;
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <div>
        <label className={lbl} style={lblStyle}>
          Event
        </label>
        <select
          className={ctl}
          style={ctlStyle}
          value={sp.get('eventId') ?? ''}
          onChange={(e) => set('eventId', e.target.value)}
        >
          <option value="">All</option>
          {options.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={lbl} style={lblStyle}>
          File type
        </label>
        <select
          className={ctl}
          style={ctlStyle}
          value={sp.get('fileType') ?? ''}
          onChange={(e) => set('fileType', e.target.value)}
        >
          <option value="">All</option>
          <option value="PHOTO">Photo</option>
          <option value="VIDEO">Video</option>
        </select>
      </div>
      <div>
        <label className={lbl} style={lblStyle}>
          Sponsor
        </label>
        <select
          className={ctl}
          style={ctlStyle}
          value={sp.get('sponsor') ?? ''}
          onChange={(e) => set('sponsor', e.target.value)}
        >
          <option value="">All</option>
          {options.sponsors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label className={lbl} style={lblStyle}>
            From
          </label>
          <input
            type="date"
            className={`${ctl} min-w-0`}
            style={ctlStyle}
            value={sp.get('from') ?? ''}
            onChange={(e) => set('from', e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className={lbl} style={lblStyle}>
            To
          </label>
          <input
            type="date"
            className={`${ctl} min-w-0`}
            style={ctlStyle}
            value={sp.get('to') ?? ''}
            onChange={(e) => set('to', e.target.value)}
          />
        </div>
      </div>
      <label
        className="flex items-center gap-2 text-[13px]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <input
          type="checkbox"
          style={{ accentColor: 'var(--primary)' }}
          checked={sp.get('isSelect') === 'true'}
          onChange={(e) => set('isSelect', e.target.checked ? 'true' : '')}
        />
        Selects only
      </label>
      <div>
        <div className={lbl} style={lblStyle}>
          Color
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {COLOR_BUCKETS.map((bucket, i) => {
            const active = sp.get('color') === bucket.name;
            return (
              <button
                key={`${bucket.name}-${i}`}
                type="button"
                aria-label={bucket.name}
                aria-pressed={active}
                title={bucket.name}
                onClick={() => set('color', active ? '' : bucket.name)}
                className="h-6 w-6 rounded-full transition-all motion-reduce:transition-none"
                style={{
                  background: bucket.hex,
                  outline: active ? '2px solid var(--primary)' : '2px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            );
          })}
        </div>
        {sp.get('color') && (
          <button
            type="button"
            onClick={() => set('color', '')}
            className="mt-1 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            Clear color
          </button>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------
// Main export
// ------------------------------------------------------------------

export function FilterPanel({
  options,
  mobileOpen,
  onMobileClose,
}: {
  options: FilterOptions;
  /** When true on mobile: renders as a bottom sheet overlay */
  mobileOpen?: boolean;
  /** Called to close the mobile sheet (backdrop click or X button) */
  onMobileClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // Controls slide-up animation for the mobile sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };

  // Animate in/out when mobileOpen changes
  useEffect(() => {
    if (mobileOpen) {
      const id = setTimeout(() => {
        setSheetVisible(true);
        // Focus heading for screen reader accessibility
        headingRef.current?.focus();
      }, 16);
      return () => clearTimeout(id);
    } else {
      setSheetVisible(false);
    }
  }, [mobileOpen]);

  // ------------------------------------------------------------------
  // Mobile bottom sheet
  // ------------------------------------------------------------------

  if (mobileOpen) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
          onClick={onMobileClose}
        />
        {/* Sheet */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className="fixed bottom-0 left-0 right-0 z-50 rounded-[16px_16px_0_0] motion-reduce:transition-none"
          style={{
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            maxHeight: '80vh',
            overflowY: 'auto',
            paddingBottom: 'env(safe-area-inset-bottom)',
            transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3">
            <div
              className="h-[4px] w-[40px] rounded-full"
              style={{ background: 'var(--border-strong)' }}
            />
          </div>
          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-3">
            <h2
              ref={headingRef}
              className="text-[15px] font-semibold"
              style={{ color: 'var(--text-primary)' }}
              tabIndex={-1}
            >
              Filters
            </h2>
            <button
              aria-label="Close filters"
              className="rounded-[6px] p-1.5"
              onClick={onMobileClose}
            >
              <X className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
          {/* Controls */}
          <div className="flex flex-col gap-4 px-4 pb-6">
            <FilterControls options={options} sp={sp} set={set} />
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Desktop sidebar (unchanged — hidden below lg)
  // ------------------------------------------------------------------

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col gap-4 p-3 lg:flex">
      <FilterControls options={options} sp={sp} set={set} />
    </aside>
  );
}
