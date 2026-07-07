import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '@/components/ui';
import {
  EventsPageTabs,
  type EventRow,
  type SeriesRow,
} from './_components/EventsPageTabs';

export default async function OperatorEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; when?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const listQuery = new URLSearchParams();
  for (const key of ['q', 'status', 'when', 'sort', 'page'] as const) {
    if (params[key]) listQuery.set(key, params[key]!);
  }
  const qs = listQuery.toString();

  const [eventsRes, seriesRes] = await Promise.all([
    operatorServerFetch(`/api/operator/events${qs ? `?${qs}` : ''}`),
    operatorServerFetch('/api/operator/series'),
  ]);

  if (!eventsRes.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Unable to load events.
      </div>
    );
  }

  const { events, total, page, pageSize } = (await eventsRes.json()) as {
    events: EventRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  const filtered = Boolean(params.q || params.status || params.when);
  const series: SeriesRow[] = seriesRes.ok
    ? ((await seriesRes.json()) as { series: SeriesRow[] }).series
    : [];

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
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

        <EventsPageTabs
          events={events}
          series={series}
          total={total}
          page={page}
          pageSize={pageSize}
          filtered={filtered}
        />
      </div>
    </div>
  );
}
