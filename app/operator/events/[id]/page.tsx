import Link from 'next/link';
import { Suspense } from 'react';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { EventTabs } from './_components/EventTabs';
import { EventOverviewTab } from './_components/EventOverviewTab';
import { EventAttendeesTab } from './_components/EventAttendeesTab';
import { EventApplicationsTab } from './_components/EventApplicationsTab';
import { EventCheckinTab } from './_components/EventCheckinTab';
import { EventSettingsTab } from './_components/EventSettingsTab';
import { CopyInviteLinkButton } from './_components/CopyInviteLinkButton';

const PRODUCER_URL = process.env.NEXT_PUBLIC_PRODUCER_URL ?? null;

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
  eventAccess: unknown;
  runOfShow: string | null;
  template: string;
  customQuestions: {
    id: string;
    label: string;
    fieldType: string;
    options: string[];
    required: boolean;
    order: number;
    showToMember: boolean;
    showToGuest: boolean;
  }[];
  _count: { rsvps: number };
  _stats: {
    confirmedCount: number;
    heldCount: number;
    capacityUsed: number;
    revenueCents: number;
  };
};

type RsvpRow = {
  id: string;
  ticketStatus: string;
  origin: string;
  checkedIn: boolean;
  createdAt: string;
  stripePaymentIntentId: string | null;
  refundAmountCents: number | null;
  refundedAt: string | null;
  member: { firstName: string; lastName: string; email: string };
  plusOneOfMemberId: string | null;
};

type ApplicationRow = {
  id: string;
  fullName: string;
  email: string;
  city: string | null;
  phone: string | null;
  submittedAt: string;
  status: string;
  aiTags: string[];
  aiScore: number | null;
  aiRecommendation: string | null;
  aiReasoning: string | null;
  answers: Record<string, string>;
};

function statusBadgeCls(status: string): string {
  if (status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-900';
  if (status === 'CANCELLED') return 'bg-red-50 text-red-800';
  return 'bg-muted text-text-muted';
}

export default async function OperatorEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam ?? 'overview';

  // Always fetch event
  const eventRes = await operatorServerFetch(`/api/operator/events/${id}`);

  if (eventRes.status === 404) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Event not found.{' '}
        <Link href="/operator/events" className="text-primary underline">
          Back
        </Link>
      </div>
    );
  }
  if (!eventRes.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load event.
      </div>
    );
  }

  const { event } = (await eventRes.json()) as { event: EventFull };

  // Tab-specific fetches
  let rsvps: RsvpRow[] = [];
  let applications: ApplicationRow[] = [];

  if (tab === 'attendees' || tab === 'checkin') {
    const rsvpRes = await operatorServerFetch(`/api/operator/events/${id}/rsvps`);
    if (rsvpRes.ok) {
      const data = await rsvpRes.json();
      rsvps = data.rsvps ?? [];
    }
  }

  if (tab === 'applications') {
    const appRes = await operatorServerFetch(
      `/api/operator/applications?eventId=${id}&status=pending`,
    );
    if (appRes.ok) {
      const data = await appRes.json();
      applications = data.applications ?? [];
    }
  }

  const formattedDate = new Date(event.startAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="px-4 pb-20 pt-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-4">
          <Link
            href="/operator/events"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            ← All events
          </Link>
        </div>

        <h1
          className="mb-1 text-3xl font-normal text-text-primary"
          style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
        >
          {event.title}
        </h1>
        <p className="mb-4 flex items-center gap-2 text-sm text-text-muted">
          <span>{formattedDate}</span>
          <span>·</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeCls(event.status)}`}
          >
            {event.status.toLowerCase()}
          </span>
        </p>

        {/* Action bar */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <CopyInviteLinkButton slug={event.slug} />
          <a
            href={`/m/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]"
          >
            Preview Member Page ↗
          </a>
          {PRODUCER_URL && (
            <a
              href={`${PRODUCER_URL}/events/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--apply-rule)] bg-white px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)]"
            >
              Open in Producer ↗
            </a>
          )}
        </div>

        {/* Tab nav */}
        <Suspense fallback={null}>
          <EventTabs eventId={id} activeTab={tab} />
        </Suspense>

        {/* Tab content */}
        {tab === 'overview' && <EventOverviewTab event={event} />}
        {tab === 'attendees' && (
          <EventAttendeesTab
            rsvps={rsvps}
            eventId={id}
            priceInCents={event.priceInCents}
          />
        )}
        {tab === 'applications' && (
          <EventApplicationsTab applications={applications} eventId={id} />
        )}
        {tab === 'checkin' && <EventCheckinTab rsvps={rsvps} eventId={id} />}
        {tab === 'settings' && <EventSettingsTab event={event} />}
      </div>
    </div>
  );
}
