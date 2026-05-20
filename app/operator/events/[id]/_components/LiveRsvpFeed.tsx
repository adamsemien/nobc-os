'use client';

import { useEffect, useState } from 'react';

type FeedItem = {
  id: string;
  createdAt: string;
  archetype: string | null;
  member: { firstName: string; lastName: string; email: string } | null;
  guestName: string | null;
};

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} hr ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function LiveRsvpFeed({ eventId, enabled = true }: { eventId: string; enabled?: boolean }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [newestId, setNewestId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/operator/events/${eventId}/rsvps?limit=5&order=desc`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { rsvps: FeedItem[] };
        const next = (data.rsvps ?? []).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          archetype: r.archetype ?? null,
          member: r.member ?? null,
          guestName: r.guestName ?? null,
        }));
        setItems((prev) => {
          const firstId = next[0]?.id;
          if (firstId && prev[0]?.id !== firstId && prev.length > 0) {
            setNewestId(firstId);
            setTimeout(() => setNewestId(null), 2500);
          }
          return next;
        });
      } catch {
        /* swallow */
      }
    }

    void tick();
    const handle = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [eventId, enabled]);

  if (!enabled || items.length === 0) return null;

  return (
    <div
      className="rounded-lg border bg-card p-4"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Live feed
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-text-tertiary">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: 'var(--success)' }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--success)' }} />
          </span>
          updating
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((it) => {
          const name = it.member ? `${it.member.firstName} ${it.member.lastName}`.trim() : it.guestName ?? 'Guest';
          const isNew = newestId === it.id;
          return (
            <li
              key={it.id}
              className="flex items-center justify-between text-sm transition-colors"
              style={{
                background: isNew ? 'var(--primary-soft, var(--muted))' : 'transparent',
                borderRadius: 6,
                padding: '6px 8px',
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-text-primary">{name}</p>
                {it.archetype ? (
                  <p className="text-[10px] uppercase tracking-widest text-text-secondary">{it.archetype}</p>
                ) : null}
              </div>
              <span className="ml-3 shrink-0 text-[11px] text-text-tertiary">{relative(it.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
