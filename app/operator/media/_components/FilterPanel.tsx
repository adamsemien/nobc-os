'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export interface FilterOptions {
  events: { id: string; title: string }[];
  sponsors: string[];
}

/** Left filter rail. Each control writes a URL param the grid query reads. */
export function FilterPanel({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };

  const lbl = 'mb-1 block text-[11px] uppercase tracking-wide';
  const ctl = 'w-full rounded-[6px] border px-2 py-1.5 text-[13px]';
  const ctlStyle = { borderColor: 'var(--border)', background: 'var(--card)' } as const;
  const lblStyle = { color: 'var(--text-muted)' } as const;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-4 p-3">
      <div>
        <label className={lbl} style={lblStyle}>Event</label>
        <select className={ctl} style={ctlStyle} value={sp.get('eventId') ?? ''} onChange={(e) => set('eventId', e.target.value)}>
          <option value="">All</option>
          {options.events.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={lbl} style={lblStyle}>File type</label>
        <select className={ctl} style={ctlStyle} value={sp.get('fileType') ?? ''} onChange={(e) => set('fileType', e.target.value)}>
          <option value="">All</option>
          <option value="PHOTO">Photo</option>
          <option value="VIDEO">Video</option>
        </select>
      </div>
      <div>
        <label className={lbl} style={lblStyle}>Sponsor</label>
        <select className={ctl} style={ctlStyle} value={sp.get('sponsor') ?? ''} onChange={(e) => set('sponsor', e.target.value)}>
          <option value="">All</option>
          {options.sponsors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={lbl} style={lblStyle}>From</label>
          <input type="date" className={ctl} style={ctlStyle} value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="flex-1">
          <label className={lbl} style={lblStyle}>To</label>
          <input type="date" className={ctl} style={ctlStyle} value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={sp.get('isSelect') === 'true'}
          onChange={(e) => set('isSelect', e.target.checked ? 'true' : '')}
        />
        Selects only
      </label>
    </aside>
  );
}
