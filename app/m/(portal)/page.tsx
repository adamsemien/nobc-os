import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { MemberCard } from './_components/MemberCard';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase();
  const day = d.getDate();
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${weekday} · ${month} ${day} · ${time}`;
}

function countdown(startAt: Date): string {
  const ms = startAt.getTime() - Date.now();
  if (ms < 0) return 'past';
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return formatDate(startAt.toISOString());
}

function RsvpStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed: { bg: 'var(--success-soft)', color: 'var(--success)', label: "you're in" },
    pending_approval: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'pending' },
    waitlisted: { bg: 'var(--neutral-soft)', color: 'var(--events-fg-soft)', label: 'waitlisted' },
  };
  const m = map[status] ?? { bg: 'var(--neutral-soft)', color: 'var(--events-fg-soft)', label: status };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}

export default async function MemberHomePage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      approvedAt: true,
      createdAt: true,
    },
  });

  if (!member) {
    return (
      <div className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-14">
        <p className="text-sm" style={{ color: 'var(--events-fg-soft)' }}>
          Your membership is being set up.
        </p>
      </div>
    );
  }

  const application = await db.application.findFirst({
    where: { workspaceId, email: member.email },
    orderBy: { createdAt: 'desc' },
    select: { archetype: true },
  });

  const memberSinceDate = (member.approvedAt ?? member.createdAt).toISOString();
  const memberNumber = member.id.slice(-6).toUpperCase();

  const now = new Date();
  const upcomingEvents = await db.event.findMany({
    where: {
      workspaceId,
      status: 'PUBLISHED',
      startAt: { gte: now },
    },
    orderBy: { startAt: 'asc' },
    take: 3,
    select: {
      id: true,
      slug: true,
      title: true,
      startAt: true,
      location: true,
      capacity: true,
      heroImageAssetId: true,
      rsvps: {
        where: { memberId: member.id },
        select: { id: true, ticketStatus: true },
      },
    },
  });

  const recentRsvps = await db.rSVP.findMany({
    where: { workspaceId, memberId: member.id },
    include: {
      event: { select: { id: true, title: true, slug: true, startAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-14 pb-10 space-y-12">
      <header>
        <h1
          className="text-3xl sm:text-4xl font-normal italic"
          style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
        >
          Welcome back, {member.firstName || 'Member'}.
        </h1>
      </header>

      <section>
        <p
          className="text-[0.65rem] uppercase tracking-[0.2em] mb-4"
          style={{ color: 'var(--events-fg-quiet)' }}
        >
          Your member card
        </p>
        <MemberCard
          firstName={member.firstName ?? ''}
          lastName={member.lastName ?? ''}
          archetype={application?.archetype ?? null}
          memberSince={memberSinceDate}
          memberNumber={memberNumber}
        />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <p
            className="text-[0.65rem] uppercase tracking-[0.2em]"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            Upcoming
          </p>
          <Link
            href="/m/events"
            className="text-[0.6rem] uppercase tracking-[0.18em]"
            style={{ color: 'var(--events-warm-accent)' }}
          >
            Browse all →
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <div
            className="rounded-lg border p-8 text-center"
            style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
          >
            <p className="text-sm" style={{ color: 'var(--events-fg-quiet)' }}>
              Nothing on the calendar yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {upcomingEvents.map((ev) => {
              const rsvp = ev.rsvps[0];
              const chipStatus = rsvp?.ticketStatus ?? 'rsvp';
              return (
                <Link
                  key={ev.id}
                  href={`/m/events/${ev.slug}`}
                  className="rounded-lg border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-opacity hover:opacity-80"
                  style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
                >
                  <div>
                    <p
                      className="text-lg italic"
                      style={{ color: 'var(--events-fg)', fontFamily: 'var(--font-display)' }}
                    >
                      {ev.title}
                    </p>
                    <p
                      className="text-[0.6rem] uppercase tracking-[0.18em] mt-1"
                      style={{ color: 'var(--events-fg-soft)' }}
                    >
                      {countdown(ev.startAt)}
                    </p>
                    {ev.location ? (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--events-fg-quiet)' }}>
                        {ev.location}
                      </p>
                    ) : null}
                  </div>
                  {rsvp ? (
                    <RsvpStatusChip status={chipStatus} />
                  ) : (
                    <span
                      className="text-[0.6rem] uppercase tracking-[0.18em]"
                      style={{ color: 'var(--events-warm-accent)' }}
                    >
                      RSVP →
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <p
            className="text-[0.65rem] uppercase tracking-[0.2em]"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            Your Access
          </p>
          <Link
            href="/m/rsvps"
            className="text-[0.6rem] uppercase tracking-[0.18em]"
            style={{ color: 'var(--events-warm-accent)' }}
          >
            See all →
          </Link>
        </div>
        {recentRsvps.length === 0 ? (
          <div
            className="rounded-lg border p-6 text-center"
            style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
          >
            <p className="text-sm" style={{ color: 'var(--events-fg-quiet)' }}>
              No RSVPs yet — find your first event.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recentRsvps.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/m/events/${r.event.slug}`}
                  className="flex items-center justify-between rounded-md border px-4 py-2.5 text-sm transition-opacity hover:opacity-80"
                  style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
                >
                  <span style={{ color: 'var(--events-fg)' }}>{r.event.title}</span>
                  <RsvpStatusChip status={r.ticketStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer
        className="flex flex-wrap gap-x-5 gap-y-2 pt-6 text-[0.6rem] uppercase tracking-[0.2em]"
        style={{ borderTop: '1px solid var(--events-line-soft)', color: 'var(--events-fg-quiet)' }}
      >
        <Link href="/m/events" style={{ color: 'var(--events-fg-soft)' }}>Browse events</Link>
        <Link href="/m/profile" style={{ color: 'var(--events-fg-soft)' }}>Profile</Link>
        <Link href="/m/help" style={{ color: 'var(--events-fg-soft)' }}>Help</Link>
      </footer>
    </div>
  );
}
