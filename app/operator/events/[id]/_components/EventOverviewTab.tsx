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
  applyMode: string | null;
  capacity: number | null;
  showCapacity: boolean;
  approvalRequired: boolean;
  plusOnesAllowed: boolean;
  priceInCents: number | null;
  nonMemberPriceInCents: number | null;
  runOfShow: string | null;
  customQuestions: {
    id: string;
    label: string;
    fieldType: string;
    options: string[];
    required: boolean;
    order: number;
  }[];
  _count: { rsvps: number };
};

type Props = { event: EventFull };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysUntil(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = then - now;
  if (diff < 0) return 'Past';
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  );
}

export function EventOverviewTab({ event }: Props) {
  const until = daysUntil(event.startAt);
  const isPast = until === 'Past';

  return (
    <div className="space-y-6">
      {/* Hero image */}
      {event.heroImageAssetId ? (
        <div className="overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.heroImageAssetId}
            alt={event.title}
            className="h-56 w-full object-cover sm:h-72"
            style={{ borderRadius: '8px' }}
          />
        </div>
      ) : (
        <div
          className="flex h-40 w-full items-center justify-center rounded-lg bg-muted text-sm text-text-muted"
          style={{ borderRadius: '8px' }}
        >
          No hero image
        </div>
      )}

      {/* Key stats */}
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary">
          {event._count.rsvps}{event.capacity ? ` / ${event.capacity}` : ''} RSVPs
        </span>
        <span className="rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary">
          {event.accessMode.toLowerCase().replace('_', ' ')}
        </span>
        <span
          className={`rounded-full border border-border px-3 py-1 text-xs font-medium ${
            isPast ? 'bg-muted text-text-muted' : 'bg-surface-elevated text-text-secondary'
          }`}
        >
          {until}
        </span>
      </div>

      {/* Event details */}
      <div className="rounded-lg border border-border bg-surface-elevated" style={{ borderRadius: '8px' }}>
        <dl className="divide-y divide-border px-4">
          <Row label="Title" value={event.title} />
          <Row label="Slug" value={<span className="font-mono text-xs">{event.slug}</span>} />
          <Row label="Start" value={formatDate(event.startAt)} />
          {event.endAt && <Row label="End" value={formatDate(event.endAt)} />}
          {event.location && <Row label="Location" value={event.location} />}
          <Row label="Access mode" value={event.accessMode} />
          {event.priceInCents != null && (
            <Row label="Member price" value={`$${(event.priceInCents / 100).toFixed(2)}`} />
          )}
          {event.nonMemberPriceInCents != null && (
            <Row label="Non-member price" value={`$${(event.nonMemberPriceInCents / 100).toFixed(2)}`} />
          )}
          <Row label="Capacity" value={event.capacity ?? 'Unlimited'} />
          <Row label="Approval required" value={event.approvalRequired ? 'Yes' : 'No'} />
          <Row label="Plus-ones" value={event.plusOnesAllowed ? 'Allowed' : 'No'} />
          <Row label="Show capacity" value={event.showCapacity ? 'Yes' : 'No'} />
          <Row label="Status" value={event.status} />
        </dl>
      </div>

      {/* Description */}
      {event.description && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Description
          </h3>
          <p className="text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
            {event.description}
          </p>
        </div>
      )}

      {/* Run of show */}
      {event.runOfShow && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Run of Show
          </h3>
          <pre className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-text-primary whitespace-pre-wrap font-mono" style={{ borderRadius: '8px' }}>
            {event.runOfShow}
          </pre>
        </div>
      )}
    </div>
  );
}
