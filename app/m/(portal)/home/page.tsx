import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase();
  const day = d.getDate();
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${weekday} · ${month} ${day} · ${time}`;
}

function StatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'APPROVED':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Member';
      break;
    case 'PENDING':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Pending Review';
      break;
    case 'WAITLISTED':
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Waitlisted';
      break;
    case 'REJECTED':
      bg = 'var(--danger-soft)';
      color = 'var(--danger)';
      label = 'Not Approved';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Guest';
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function RsvpStatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'confirmed':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Confirmed';
      break;
    case 'pending_approval':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Pending';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = status;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true, firstName: true, lastName: true, status: true, email: true, createdAt: true },
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

  const now = new Date();
  const upcomingRsvps =
    member.status === 'APPROVED' || member.status === 'GUEST'
      ? await db.rSVP.findMany({
          where: {
            workspaceId,
            memberId: member.id,
            ticketStatus: { in: ['confirmed', 'pending_approval'] },
            event: { startAt: { gte: now } },
          },
          include: {
            event: { select: { title: true, startAt: true, location: true, slug: true } },
            tier: { select: { name: true } },
          },
          orderBy: [{ event: { startAt: 'asc' } }],
          take: 3,
        })
      : [];

  const isPending = member.status === 'PENDING' || member.status === 'WAITLISTED';

  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
      <div className="mb-2">
        <h1
          className="text-3xl sm:text-4xl font-normal"
          style={{
            color: 'var(--events-fg)',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
          }}
        >
          Welcome back, {member.firstName || 'Member'}.
        </h1>
        <div className="mt-3">
          <StatusBadge status={member.status} />
        </div>
      </div>

      {isPending && (
        <div
          className="rounded-lg border p-6 mt-8"
          style={{
            borderColor: 'var(--events-line-soft)',
            background: 'var(--events-card)',
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--events-fg-soft)' }}
          >
            {member.status === 'PENDING'
              ? "Your application is being reviewed. We'll be in touch soon."
              : "You're on our waitlist. We'll reach out when a spot opens up."}
          </p>
        </div>
      )}

      {!isPending && (
        <div className="mt-10">
          <p
            className="text-[0.65rem] uppercase tracking-[0.2em] mb-4"
            style={{ color: 'var(--events-fg-quiet)' }}
          >
            Upcoming
          </p>

          {upcomingRsvps.length === 0 ? (
            <div
              className="rounded-lg border p-8 text-center"
              style={{
                borderColor: 'var(--events-line-soft)',
                background: 'var(--events-card)',
              }}
            >
              <p className="text-sm mb-4" style={{ color: 'var(--events-fg-quiet)' }}>
                No upcoming events on your calendar.
              </p>
              <Link
                href="/m/events"
                className="text-xs"
                style={{ color: 'var(--events-warm-accent)' }}
              >
                Browse Events →
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {upcomingRsvps.map((rsvp) => (
                  <Link
                    key={rsvp.id}
                    href={`/m/events/${rsvp.event.slug}`}
                    className="rounded-lg border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-opacity hover:opacity-80"
                    style={{
                      borderColor: 'var(--events-line-soft)',
                      background: 'var(--events-card)',
                    }}
                  >
                    <div>
                      <p
                        className="text-lg font-normal"
                        style={{
                          color: 'var(--events-fg)',
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                        }}
                      >
                        {rsvp.event.title}
                      </p>
                      <p
                        className="text-[0.6rem] uppercase tracking-[0.18em] mt-1"
                        style={{ color: 'var(--events-fg-soft)' }}
                      >
                        {formatDate(rsvp.event.startAt.toISOString())}
                      </p>
                      {rsvp.event.location && (
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: 'var(--events-fg-quiet)' }}
                        >
                          {rsvp.event.location}
                        </p>
                      )}
                    </div>
                    <RsvpStatusBadge status={rsvp.ticketStatus} />
                  </Link>
                ))}
              </div>
              <div className="mt-6">
                <Link
                  href="/m/events"
                  className="inline-block rounded border px-4 py-2 text-[0.6rem] uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
                  style={{
                    borderColor: 'var(--events-warm-accent)',
                    color: 'var(--events-warm-accent)',
                  }}
                >
                  Browse Events →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
