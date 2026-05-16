import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { EmptyState } from '../_components/EmptyState';

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
  if (status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-900';
  if (status === 'CANCELLED') return 'bg-red-50 text-red-800';
  return 'bg-muted text-text-muted';
}

function statusLabel(status: string, startAt: string): string {
  if (new Date(startAt) < new Date()) return 'past';
  return status.toLowerCase();
}

export default async function OperatorEventsPage() {
  const res = await operatorServerFetch('/api/operator/events');

  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Unable to load events.
      </div>
    );
  }

  const { events } = (await res.json()) as { events: EventRow[] };

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-semibold tracking-tight text-text-primary font-[family-name:var(--font-dm-sans)]">
            Events
          </h1>
          <Link
            href="/operator/events/new"
            className="btn-shimmer inline-flex items-center rounded-[8px] bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            + New Event
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon="event"
            title="Nothing here yet."
            action={{ label: 'Create your first event →', href: '/operator/events/new' }}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
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
                    className="bg-surface-elevated transition-colors hover:bg-muted"
                  >
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
        )}
      </div>
    </div>
  );
}
