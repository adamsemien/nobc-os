import { accessModeLabel } from '@/lib/format-enums';
import { StatusBadge } from '@/components/ui';

type EventFull = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  heroImageAssetId: string | null;
  startAt: string;
  endAt: string | null;
  location: string | null;
  status: string;
  accessMode: string;
  capacity: number | null;
  runOfShow: string | null;
  _count: { rsvps: number };
  _stats: {
    confirmedCount: number;
    heldCount: number;
    capacityUsed: number;
    revenueCents: number;
    checkedInCount: number;
    capturedRevenueCents: number;
  };
};

type Props = { event: EventFull; heroImageUrl: string | null };

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysUntil(iso: string): { value: string; sub: string } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return { value: 'Past', sub: 'event has ended' };
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return { value: 'Today', sub: 'happening now' };
  if (days === 1) return { value: '1', sub: 'day away' };
  return { value: String(days), sub: 'days away' };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="op-card flex flex-1 flex-col gap-1 border border-border px-4 py-3.5"
      style={{ minWidth: '140px' }}
    >
      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-text-muted">{label}</span>
      <span
        className="text-3xl font-light text-text-primary"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

// Replaces the "Days Until" card once an event is in the past — a single
// at-a-glance recap of how the night actually went.
function PostEventCard({
  attendance,
  rate,
  noShows,
  revenue,
}: {
  attendance: string;
  rate: number;
  noShows: number;
  revenue: string;
}) {
  return (
    <div
      className="op-card flex flex-1 flex-col gap-1 border border-border px-4 py-3.5"
      style={{ minWidth: '200px' }}
    >
      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-text-muted">
        Post-Event Summary
      </span>
      <span
        className="text-3xl font-light text-text-primary"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {attendance}
      </span>
      <span className="text-xs text-text-muted">
        checked in · {rate}% rate · {noShows} no-show{noShows === 1 ? '' : 's'}
      </span>
      <span className="text-xs text-text-muted">{revenue} captured</span>
    </div>
  );
}

export function EventOverviewTab({ event, heroImageUrl }: Props) {
  const { _stats } = event;
  const until = daysUntil(event.startAt);
  const isPast = new Date(event.startAt).getTime() < Date.now();

  const capacityRemaining =
    event.capacity != null ? Math.max(0, event.capacity - _stats.capacityUsed) : null;

  const revenueLabel =
    _stats.revenueCents > 0
      ? `$${(_stats.revenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : '$0';

  // Post-event recap figures (only shown once the event has passed).
  const checkInRate =
    _stats.confirmedCount > 0
      ? Math.round((_stats.checkedInCount / _stats.confirmedCount) * 100)
      : 0;
  const noShows = Math.max(0, _stats.confirmedCount - _stats.checkedInCount);
  const capturedRevenueLabel =
    _stats.capturedRevenueCents > 0
      ? `$${(_stats.capturedRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : '$0';

  return (
    <div className="space-y-8 page-fade-in">
      {/* Hero — 16:9 cover, never a member-page template */}
      {heroImageUrl ? (
        <div className="overflow-hidden rounded-lg border border-border" style={{ borderRadius: '10px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImageUrl}
            alt={event.title}
            className="aspect-[16/9] w-full object-cover"
          />
        </div>
      ) : (
        <div
          className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-border"
          style={{
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--raised) 0%, var(--surface) 100%)',
          }}
        >
          <span
            className="text-lg text-text-tertiary"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.2em' }}
          >
            NO BAD COMPANY
          </span>
        </div>
      )}

      {/* Date / venue meta — small caps */}
      <div className="space-y-1">
        <p
          className="text-text-secondary"
          style={{ letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}
        >
          {formatEventDate(event.startAt)} · {formatEventTime(event.startAt)}
          {event.endAt && ` – ${formatEventTime(event.endAt)}`}
        </p>
        {event.location && (
          <p
            className="text-text-muted"
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem' }}
          >
            {event.location}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={event.status === 'PUBLISHED' ? 'success' : 'warning'}>
            {event.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {accessModeLabel(event.accessMode)}
          </StatusBadge>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Confirmed RSVPs"
          value={String(_stats.confirmedCount)}
          sub={event.capacity ? `of ${event.capacity} capacity` : 'no capacity cap'}
        />
        <StatCard
          label="Capacity Left"
          value={capacityRemaining != null ? String(capacityRemaining) : '∞'}
          sub={_stats.heldCount > 0 ? `${_stats.heldCount} held` : 'open spots'}
        />
        <StatCard label="Revenue" value={revenueLabel} sub="confirmed only" />
        {isPast ? (
          <PostEventCard
            attendance={`${_stats.checkedInCount} / ${_stats.confirmedCount}`}
            rate={checkInRate}
            noShows={noShows}
            revenue={capturedRevenueLabel}
          />
        ) : (
          <StatCard label="Days Until" value={until.value} sub={until.sub} />
        )}
      </div>

      {/* Description */}
      {event.description && (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-text-muted">
            About this event
          </h3>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-text-secondary" style={{ maxWidth: '62ch' }}>
            {event.description}
          </p>
        </div>
      )}

      {/* Run of show */}
      {event.runOfShow && (
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-widest text-text-muted">
            Run of Show
          </h3>
          <pre
            className="rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm leading-relaxed text-text-primary"
            style={{
              borderRadius: '8px',
              fontFamily: 'var(--font-dm-sans), var(--font-geist-sans), system-ui',
              whiteSpace: 'pre-wrap',
            }}
          >
            {event.runOfShow}
          </pre>
        </div>
      )}
    </div>
  );
}
