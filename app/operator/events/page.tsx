import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '@/components/ui';
import {
  EventsPageTabs,
  type EventRow,
  type SeriesRow,
} from './_components/EventsPageTabs';

export default async function OperatorEventsPage() {
  const [eventsRes, seriesRes] = await Promise.all([
    operatorServerFetch('/api/operator/events'),
    operatorServerFetch('/api/operator/series'),
  ]);

  if (!eventsRes.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Unable to load events.
      </div>
    );
  }

  const { events } = (await eventsRes.json()) as { events: EventRow[] };
  const series: SeriesRow[] = seriesRes.ok
    ? ((await seriesRes.json()) as { series: SeriesRow[] }).series
    : [];

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader
          title="Events"
          subtitle="Upcoming, past, and recurring series."
          action={
            <Link
              href="/operator/events/new"
              className="btn-shimmer inline-flex items-center rounded-[8px] bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              + New Event
            </Link>
          }
        />

        <EventsPageTabs events={events} series={series} />
      </div>
    </div>
  );
}
