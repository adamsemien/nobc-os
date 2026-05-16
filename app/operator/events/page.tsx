import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { EmptyState } from '../_components/EmptyState';
import { EventsTable } from './_components/EventsTable';

export default async function OperatorEventsPage() {
  const res = await operatorServerFetch('/api/operator/events');

  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Unable to load events.
      </div>
    );
  }

  const { events } = (await res.json()) as { events: Array<{
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
  }> };

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
          <EventsTable events={events} />
        )}
      </div>
    </div>
  );
}
