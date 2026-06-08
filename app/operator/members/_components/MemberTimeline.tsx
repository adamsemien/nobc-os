'use client';

/**
 * Member engagement timeline (member-intelligence PR3, F2). Client island: virtualizes the
 * day-grouped engagement feed with @tanstack/react-virtual so a long history stays cheap to
 * render. Reads through useMemberRecord seeded with the server's initialData — no
 * refetch-on-mount, and it seeds the TanStack cache the F4 optimistic edit (Slice 2) updates.
 * Event types render as locked human labels (never raw enums) via lib/engagement-labels.
 */
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemberRecord } from '@/lib/hooks/useMemberRecord';
import { engagementMeta, type EngagementTone } from '@/lib/engagement-labels';
import type { MemberRecord, MemberTimelineEntry } from '@/lib/member-record';

const DOT_CLS: Record<EngagementTone, string> = {
  positive: 'bg-success',
  negative: 'bg-danger',
  info: 'bg-primary',
  neutral: 'bg-border-strong',
};

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; entry: MemberTimelineEntry };

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function buildRows(timeline: MemberTimelineEntry[]): Row[] {
  const rows: Row[] = [];
  let lastDayKey = '';
  for (const entry of timeline) {
    const d = new Date(entry.occurredAt);
    const dayKey = entry.occurredAt.slice(0, 10); // YYYY-MM-DD, already ISO
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      rows.push({ kind: 'day', key: `day-${dayKey}`, label: dayLabel(d) });
    }
    rows.push({ kind: 'event', key: entry.id, entry });
  }
  return rows;
}

export function MemberTimeline({ memberId, initialData }: { memberId: string; initialData: MemberRecord }) {
  const { data } = useMemberRecord(memberId, { initialData });
  const timeline = data?.timeline ?? initialData.timeline;
  const rows = useMemo(() => buildRows(timeline), [timeline]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === 'day' ? 40 : 64),
    overscan: 8,
  });

  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-text-muted">No activity yet.</p>
    );
  }

  return (
    <div ref={parentRef} className="mt-3 max-h-[560px] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={row.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
            >
              {row.kind === 'day' ? (
                <div className="bg-card pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {row.label}
                </div>
              ) : (
                <EventRow entry={row.entry} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({ entry }: { entry: MemberTimelineEntry }) {
  const meta = engagementMeta(entry.eventType);
  const d = new Date(entry.occurredAt);
  return (
    <div className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLS[meta.tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary">{meta.label}</div>
      </div>
      <time className="shrink-0 text-xs tabular-nums text-text-muted" dateTime={entry.occurredAt}>
        {timeLabel(d)}
      </time>
    </div>
  );
}
