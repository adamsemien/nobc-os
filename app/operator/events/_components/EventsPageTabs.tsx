'use client';

/** Tab switcher on /operator/events — the event list and the recurring-series
 *  panel live side by side as tabs (no separate route). */
import { useState } from 'react';
import { EventsTable } from './EventsTable';
import { SeriesPanel } from './SeriesPanel';
import { EmptyState } from '../../_components/EmptyState';

export type EventRow = {
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

export type SeriesRow = {
  id: string;
  name: string;
  description: string | null;
  recurrenceRule: string;
  startsAt: string;
  endsAt: string | null;
  count: number | null;
  active: boolean;
  _count: { events: number };
};

export function EventsPageTabs({
  events,
  series,
}: {
  events: EventRow[];
  series: SeriesRow[];
}) {
  const [tab, setTab] = useState<'events' | 'series'>('events');

  const tabCls = (active: boolean) =>
    `px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? 'border-b-2 border-primary text-text-primary'
        : 'text-text-muted hover:text-text-secondary'
    }`;

  return (
    <>
      <div className="mb-6 flex gap-1 border-b border-border">
        <button type="button" className={tabCls(tab === 'events')} onClick={() => setTab('events')}>
          Events
        </button>
        <button type="button" className={tabCls(tab === 'series')} onClick={() => setTab('series')}>
          Series
        </button>
      </div>

      {tab === 'events' ? (
        events.length === 0 ? (
          <EmptyState
            icon="event"
            title="Nothing here yet."
            action={{ label: 'Create your first event →', href: '/operator/events/new' }}
          />
        ) : (
          <EventsTable events={events} />
        )
      ) : (
        <SeriesPanel initialSeries={series} />
      )}
    </>
  );
}
