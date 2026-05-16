'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type EventRow = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  location: string | null;
  status: string;
  accessMode: string;
  capacity: number | null;
  priceInCents: number | null;
  capacityUsed: number;
  revenueCents: number;
};

function statusBadgeCls(status: string, startAt: string): string {
  if (new Date(startAt) < new Date()) return 'bg-muted text-text-muted';
  if (status === 'PUBLISHED') return 'bg-success-soft text-success';
  if (status === 'CANCELLED') return 'bg-danger-soft text-danger';
  return 'bg-muted text-text-muted';
}

function statusLabel(status: string, startAt: string): string {
  if (new Date(startAt) < new Date()) return 'past';
  return status.toLowerCase();
}

export function EventsTable({ events }: { events: EventRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allSelected = selected.size === events.length && events.length > 0;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(events.map(e => e.id)));
    }
  }, [allSelected, events]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/operator/events/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (res.ok) {
        setSelected(new Set());
        setConfirmOpen(false);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }, [selected, router]);

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5">
          <span className="text-sm font-medium text-text-primary">
            {selected.size} event{selected.size > 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="ml-auto rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger/90"
          >
            Delete {selected.size} event{selected.size > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border accent-primary"
                  aria-label="Select all events"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Event
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Capacity
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Revenue
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map(event => (
              <tr
                key={event.id}
                className={`transition-colors ${selected.has(event.id) ? 'bg-primary/5' : 'bg-surface-elevated hover:bg-muted'}`}
              >
                <td className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(event.id)}
                    onChange={() => toggle(event.id)}
                    className="h-4 w-4 rounded border-border accent-primary"
                    aria-label={`Select ${event.title}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/operator/events/${event.id}`}
                    className="font-medium text-text-primary underline-offset-2 hover:text-primary hover:underline"
                  >
                    {event.title}
                  </Link>
                  {event.location && (
                    <p className="mt-0.5 text-xs text-text-muted">{event.location}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {new Date(event.startAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeCls(event.status, event.startAt)}`}
                  >
                    {statusLabel(event.status, event.startAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {event.capacity
                    ? `${event.capacityUsed} / ${event.capacity}`
                    : event.capacityUsed > 0
                      ? String(event.capacityUsed)
                      : '—'}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {event.revenueCents > 0
                    ? `$${(event.revenueCents / 100).toFixed(0)}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/operator/events/${event.id}`}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Delete events?</h2>
            <p className="mt-2 text-sm text-text-secondary">
              This will permanently delete {selected.size} event{selected.size > 1 ? 's' : ''} and
              all their RSVPs. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
