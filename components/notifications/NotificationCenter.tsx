'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/notifications', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unread: number;
      };
      setItems(data.notifications);
      setUnread(data.unread);
      setLoaded(true);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = useCallback(
    async (id: string) => {
      await fetch('/api/operator/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id }),
      });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnread((u) => Math.max(0, u - 1));
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    await fetch('/api/operator/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnread(0);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-text-primary"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span
            className="absolute right-1 top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums text-on-primary"
            style={{ background: 'var(--danger, var(--accent, var(--primary)))' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[92vw] overflow-hidden rounded-md border border-border shadow-xl"
          style={{ background: 'var(--surface-elevated, var(--surface))' }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
              Notifications
            </span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {!loaded ? (
              <li className="px-3 py-6 text-center text-xs text-text-muted">
                Loading…
              </li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-text-muted">
                You&apos;re all caught up.
              </li>
            ) : (
              items.map((n) => {
                const unreadItem = !n.readAt;
                const Inner = (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          unreadItem ? '' : 'opacity-0'
                        }`}
                        style={{ background: 'var(--primary)' }}
                      />
                      <span className="text-[13px] font-medium text-text-primary">
                        {n.title}
                      </span>
                      <span className="ml-auto text-[10px] text-text-muted">
                        {formatRelative(n.createdAt)}
                      </span>
                    </div>
                    {n.body ? (
                      <p className="ml-4 mt-0.5 truncate text-xs text-text-secondary">
                        {n.body}
                      </p>
                    ) : null}
                  </>
                );
                const onClick = () => {
                  if (unreadItem) void markRead(n.id);
                  setOpen(false);
                };
                return (
                  <li key={n.id} className="border-b border-border last:border-b-0">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={onClick}
                        className="block px-3 py-2 transition-colors hover:bg-muted"
                      >
                        {Inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={onClick}
                        className="block w-full px-3 py-2 text-left transition-colors hover:bg-muted"
                      >
                        {Inner}
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
