'use client';

import { useMemo, useState } from 'react';

export type MiniCalEvent = { id: string; startAt: string };

type Props = {
  events: MiniCalEvent[];
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function EventsMiniCalendar({ events }: Props) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const eventDays = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const e of events) {
      const d = new Date(e.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(d.getDate());
    }
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = startOfMonth(cursor).getDay();
  const dim = daysInMonth(year, month);
  const key = `${year}-${month}`;
  const marked = eventDays.get(key) ?? new Set<number>();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) cells.push(d);

  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(cursor);

  return (
    <div className="rounded-lg border border-events-line-soft bg-events-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded px-2 py-1 text-xs font-medium text-events-fg-soft transition-colors hover:bg-events-canvas-deep hover:text-events-fg"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-events-fg">
          {label}
        </p>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded px-2 py-1 text-xs font-medium text-events-fg-soft transition-colors hover:bg-events-canvas-deep hover:text-events-fg"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[0.6rem] font-medium uppercase tracking-wide text-events-fg-quiet">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-xs text-events-fg-soft">
        {cells.map((d, i) =>
          d == null ? (
            <span key={`e-${i}`} className="py-1.5" />
          ) : (
            <span
              key={d}
              className={`relative flex min-h-8 items-center justify-center rounded py-1.5 ${
                marked.has(d) ? 'font-semibold text-events-fg' : ''
              }`}
            >
              {d}
              {marked.has(d) ? (
                <span
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-events-warm-accent"
                  aria-hidden
                />
              ) : null}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function UpcomingDateChips({ events }: Props) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [events],
  );
  const top = sorted.slice(0, 8);
  if (top.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {top.map(e => {
        const d = new Date(e.startAt);
        const chip = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
        return (
          <span
            key={e.id}
            className="shrink-0 rounded-full border border-events-line-soft bg-events-card px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-events-fg-soft"
          >
            {chip}
          </span>
        );
      })}
    </div>
  );
}
