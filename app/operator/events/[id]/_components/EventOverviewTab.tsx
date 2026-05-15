import { accessModeLabel } from '@/lib/format-enums';

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
  };
};

type Props = { event: EventFull };

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

function daysUntilLabel(iso: string): { label: string; isPast: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return { label: 'Past', isPast: true };
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return { label: 'Today', isPast: false };
  if (days === 1) return { label: 'Tomorrow', isPast: false };
  return { label: `${days} days away`, isPast: false };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-1 rounded-lg border border-border bg-surface-elevated px-4 py-3"
      style={{ minWidth: '120px' }}
    >
      <span className="text-xs font-medium uppercase tracking-widest text-text-muted">{label}</span>
      <span className="text-2xl font-light text-text-primary" style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)' }}>
        {value}
      </span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function EventOverviewTab({ event }: Props) {
  const { label: until, isPast } = daysUntilLabel(event.startAt);
  const { _stats } = event;

  const capacityRemaining =
    event.capacity != null
      ? Math.max(0, event.capacity - _stats.capacityUsed)
      : null;

  const revenueLabel =
    _stats.revenueCents > 0
      ? `$${(_stats.revenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
      : '$0';

  return (
    <div className="space-y-8">
      {/* Hero */}
      {event.heroImageAssetId ? (
        <div className="overflow-hidden rounded-lg" style={{ borderRadius: '8px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.heroImageAssetId}
            alt={event.title}
            className="h-64 w-full object-cover sm:h-80"
          />
        </div>
      ) : (
        <div
          className="flex h-48 w-full items-center justify-center rounded-lg"
          style={{
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--apply-bg, #F5EFE8) 0%, var(--surface-elevated, #EDE8E0) 100%)',
            border: '1px solid var(--border)',
          }}
        >
          <span
            className="text-lg tracking-widest text-text-muted"
            style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', letterSpacing: '0.2em' }}
          >
            NO BAD COMPANY
          </span>
        </div>
      )}

      {/* Date / location meta */}
      <div className="space-y-1">
        <p
          className="text-sm font-medium text-text-secondary"
          style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem' }}
        >
          {formatEventDate(event.startAt)}
          {event.endAt && ` — ${formatEventTime(event.endAt)}`}
          {!event.endAt && ` · ${formatEventTime(event.startAt)}`}
        </p>
        {event.location && (
          <p
            className="text-sm text-text-muted"
            style={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.7rem' }}
          >
            {event.location}
          </p>
        )}
        <p className="flex items-center gap-2 pt-1">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: isPast
                ? 'var(--surface-elevated)'
                : 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: isPast ? 'var(--text-muted)' : 'var(--primary)',
            }}
          >
            {until}
          </span>
          <span className="text-xs text-text-muted">{accessModeLabel(event.accessMode)}</span>
        </p>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3">
        <StatCard
          label="Confirmed"
          value={String(_stats.confirmedCount)}
          sub={event.capacity ? `of ${event.capacity} capacity` : 'no cap'}
        />
        <StatCard
          label="Capacity Left"
          value={capacityRemaining != null ? String(capacityRemaining) : '∞'}
          sub={
            _stats.heldCount > 0
              ? `${_stats.heldCount} held`
              : undefined
          }
        />
        <StatCard
          label="Revenue"
          value={revenueLabel}
          sub="confirmed only"
        />
        <StatCard
          label={isPast ? 'Event' : 'Until Event'}
          value={isPast ? 'Past' : until.replace(' days away', 'd').replace('Tomorrow', '1d').replace('Today', '0d')}
        />
      </div>

      {/* Description */}
      {event.description && (
        <div>
          <h3
            className="mb-3 text-xs font-medium uppercase tracking-widest text-text-muted"
          >
            About this event
          </h3>
          <p className="text-base leading-relaxed text-text-secondary" style={{ maxWidth: '60ch' }}>
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
            style={{ borderRadius: '8px', fontFamily: 'var(--font-dm-sans, var(--font-geist-sans, system-ui))', whiteSpace: 'pre-wrap' }}
          >
            {event.runOfShow}
          </pre>
        </div>
      )}
    </div>
  );
}
