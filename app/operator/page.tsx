import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Cake, History } from 'lucide-react';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { StatColumn } from './_components/dashboard/StatColumn';
import { SectionHeader } from './_components/dashboard/SectionHeader';
import { CapacityBar } from './_components/dashboard/CapacityBar';
import { ActivityRow } from './_components/dashboard/ActivityRow';
import { TonightPanel } from './_components/dashboard/TonightPanel';
import {
  actionLabel,
  fmtDay,
  fmtTime,
  fmtWeekday,
} from './_components/dashboard/format';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function plusDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Returns true if YYYY-MM-DD birthday falls within the next 7 days from today (month/day only). */
function birthdayWithinWeek(birthday: string, today: Date): { days: number; weekday: string } | null {
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const bMonth = parseInt(m[2], 10) - 1;
  const bDay = parseInt(m[3], 10);
  if (isNaN(bMonth) || isNaN(bDay)) return null;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    if (d.getMonth() === bMonth && d.getDate() === bDay) {
      return { days: i, weekday: d.toLocaleDateString('en-US', { weekday: 'short' }) };
    }
  }
  return null;
}

type Birthday = { memberId: string; name: string; days: number; weekday: string; label: string };

async function loadBirthdaysThisWeek(workspaceId: string): Promise<Birthday[]> {
  const apps = await db.application.findMany({
    where: { workspaceId, status: 'APPROVED', memberId: { not: null } },
    select: {
      memberId: true,
      fullName: true,
      answers: {
        where: { questionKey: 'basics.birthday' },
        select: { answer: true },
      },
    },
  });
  const today = new Date();
  const out: Birthday[] = [];
  const seen = new Set<string>();
  for (const a of apps) {
    if (!a.memberId || seen.has(a.memberId)) continue;
    const raw = a.answers[0]?.answer;
    if (!raw) continue;
    const hit = birthdayWithinWeek(raw, today);
    if (!hit) continue;
    seen.add(a.memberId);
    const label = hit.days === 0 ? 'today' : hit.days === 1 ? 'tomorrow' : hit.weekday;
    out.push({ memberId: a.memberId, name: a.fullName, days: hit.days, weekday: hit.weekday, label });
  }
  out.sort((a, b) => a.days - b.days);
  return out;
}

type Throwback = { period: string; action: string; entityType: string; entityId: string; createdAt: Date };

async function loadThrowbacks(workspaceId: string): Promise<Throwback[]> {
  const now = new Date();
  const periods: Array<{ label: string; days: number }> = [
    { label: '30 days ago', days: 30 },
    { label: '90 days ago', days: 90 },
    { label: 'a year ago', days: 365 },
  ];
  const slabs = await Promise.all(
    periods.map(async (p) => {
      const target = new Date(now);
      target.setDate(target.getDate() - p.days);
      target.setHours(0, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      const e = await db.auditEvent.findFirst({
        where: {
          workspaceId,
          createdAt: { gte: target, lte: end },
          action: {
            in: [
              'application.created',
              'application.approved',
              'event.published',
              'event.created',
              'rsvp.confirmed',
              'member.created',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
        select: { action: true, entityType: true, entityId: true, createdAt: true },
      });
      return e ? { period: p.label, ...e } : null;
    }),
  );
  return slabs.filter((x): x is Throwback => x !== null);
}

export default async function OperatorDashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const workspaceId = await requireWorkspaceId(userId);

  const today0 = startOfToday();
  const today1 = endOfToday();
  const week1 = plusDays(7);

  const [
    pendingCount,
    pendingApps,
    memberCount,
    upcomingThisWeek,
    todaysEvents,
    checkedInToday,
    upcomingEventsFull,
    recentAudit,
    birthdays,
    throwbacks,
  ] = await Promise.all([
    db.application.count({ where: { workspaceId, status: 'PENDING' } }),
    db.application.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        fullName: true,
        email: true,
        archetype: true,
        aiScore: true,
        city: true,
        createdAt: true,
      },
    }),
    db.member.count({ where: { workspaceId, status: { not: 'GUEST' } } }),
    db.event.count({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        startAt: { gte: today0, lte: week1 },
      },
    }),
    db.event.findMany({
      where: { workspaceId, status: 'PUBLISHED', startAt: { gte: today0, lte: today1 } },
      orderBy: { startAt: 'asc' },
      select: { id: true, slug: true, title: true, startAt: true, location: true, capacity: true },
    }),
    db.rSVP.count({
      where: { workspaceId, checkedIn: true, checkedInAt: { gte: today0, lte: today1 } },
    }),
    db.event.findMany({
      where: { workspaceId, status: 'PUBLISHED', startAt: { gte: today0 } },
      orderBy: { startAt: 'asc' },
      take: 3,
      select: { id: true, slug: true, title: true, startAt: true, location: true, capacity: true },
    }),
    db.auditEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
    loadBirthdaysThisWeek(workspaceId),
    loadThrowbacks(workspaceId),
  ]);

  const upcomingIds = upcomingEventsFull.map((e) => e.id);
  const upcomingCounts =
    upcomingIds.length === 0
      ? []
      : await db.rSVP.groupBy({
          by: ['eventId'],
          where: { workspaceId, eventId: { in: upcomingIds }, status: 'CONFIRMED' },
          _count: { _all: true },
        });
  const confirmedByEvent = new Map<string, number>();
  for (const c of upcomingCounts) confirmedByEvent.set(c.eventId, c._count._all);

  const today = new Date();
  const dateLine = today
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();

  return (
    <div className="px-6 pb-24 pt-16 lg:px-12 lg:pt-20">
      <div className="mx-auto w-full max-w-[1200px]">
        {/* MASTHEAD */}
        <header className="editorial-fade-in editorial-stagger-1">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.28em]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {dateLine}
          </div>
          <h1
            className="mt-6 text-5xl leading-[1.05] tracking-tight md:text-6xl"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              color: 'var(--text-primary)',
            }}
          >
            Tonight, tomorrow, this week.
          </h1>
          <p
            className="mt-4 max-w-xl text-base"
            style={{ color: 'var(--text-secondary)' }}
          >
            Everything you need to run No Bad Company.
          </p>
          <hr className="mt-10" style={{ borderColor: 'var(--border)' }} />
        </header>

        {/* THE FOUR NUMERALS */}
        <section
          className="editorial-fade-in editorial-stagger-2 grid grid-cols-2 md:grid-cols-4"
          aria-label="At a glance"
        >
          <StatColumn
            label="Pending Applications"
            value={pendingCount}
            href="/operator/applications"
            actionLabel="Review"
            accent={pendingCount > 0}
          />
          <StatColumn
            label="Members"
            value={memberCount}
            href="/operator/members"
            actionLabel="Directory"
            className="md:border-l"
          />
          <StatColumn
            label="Upcoming This Week"
            value={upcomingThisWeek}
            href="/operator/events"
            actionLabel="Events"
            className="md:border-l"
          />
          <StatColumn
            label="Checked In Today"
            value={checkedInToday}
            href="/operator/check-in"
            actionLabel="Check In"
            className="md:border-l"
          />
        </section>

        {/* TONIGHT */}
        {(todaysEvents.length > 0 || pendingApps.length > 0) ? (
          <div className="editorial-fade-in editorial-stagger-3 mt-12">
            <TonightPanel todaysEvents={todaysEvents} pendingApps={pendingApps} />
          </div>
        ) : null}

        {/* THE JOURNAL — Upcoming + Lately */}
        <div className="editorial-fade-in editorial-stagger-4 mt-16 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          {/* What's coming */}
          <section>
            <SectionHeader
              title="What's coming"
              action={
                <Link
                  href="/operator/events"
                  className="text-[11px] uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--primary)' }}
                >
                  All events →
                </Link>
              }
            />
            {upcomingEventsFull.length === 0 ? (
              <div className="py-10">
                <p
                  className="italic"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  No upcoming events.
                </p>
                <Link
                  href="/operator/events/new"
                  className="mt-3 inline-flex items-center gap-1 text-sm"
                  style={{ color: 'var(--primary)' }}
                >
                  Create one →
                </Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {upcomingEventsFull.map((e) => {
                  const confirmed = confirmedByEvent.get(e.id) ?? 0;
                  return (
                    <article key={e.id} className="flex gap-6 py-7">
                      <div className="flex w-14 shrink-0 flex-col items-start gap-1">
                        <span
                          className="text-[10px] tracking-[0.18em]"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {fmtWeekday(e.startAt)}
                        </span>
                        <span
                          className="text-4xl leading-none tabular-nums"
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 400,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {fmtDay(e.startAt)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <Link
                            href={`/operator/events/${e.id}`}
                            className="text-xl leading-tight transition-opacity hover:opacity-80"
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontWeight: 400,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {e.title}
                          </Link>
                          <div
                            className="text-xs"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {fmtTime(e.startAt)}
                            {e.location ? ` · ${e.location}` : ''}
                          </div>
                        </div>
                        <div className="mt-4">
                          <CapacityBar confirmed={confirmed} capacity={e.capacity} />
                        </div>
                        <div className="mt-4 flex items-center gap-5 text-[11px] uppercase tracking-[0.18em]">
                          <a
                            href={`/check-in/${e.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-opacity hover:opacity-70"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Check In
                          </a>
                          <Link
                            href={`/operator/events/${e.id}/room`}
                            className="transition-opacity hover:opacity-70"
                            style={{ color: 'var(--primary)' }}
                          >
                            The Room →
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Lately */}
          <section>
            <SectionHeader
              title="Lately"
              action={
                <Link
                  href="/operator/audit"
                  className="text-[11px] uppercase tracking-[0.18em] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--primary)' }}
                >
                  Full log →
                </Link>
              }
            />
            {recentAudit.length === 0 ? (
              <p
                className="py-6 italic"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-secondary)',
                }}
              >
                Nothing has happened yet.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {recentAudit.map((e) => (
                  <ActivityRow
                    key={e.id}
                    action={e.action}
                    entityType={e.entityType}
                    createdAt={e.createdAt}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* MARGINALIA */}
        {(birthdays.length > 0 || throwbacks.length > 0) ? (
          <section
            className="editorial-fade-in editorial-stagger-5 mt-20 grid gap-12 border-t pt-12 lg:grid-cols-2"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Marginalia"
          >
            {birthdays.length > 0 ? (
              <div>
                <div
                  className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Cake className="h-3 w-3" aria-hidden />
                  Birthdays this week
                </div>
                <ul>
                  {birthdays.map((b) => (
                    <li key={b.memberId}>
                      <Link
                        href={`/operator/members/${b.memberId}`}
                        className="flex items-center justify-between py-2 text-sm transition-opacity hover:opacity-70"
                      >
                        <span style={{ color: 'var(--text-primary)' }}>{b.name}</span>
                        <span
                          className="text-[11px] uppercase tracking-[0.18em]"
                          style={{
                            color:
                              b.days === 0 ? 'var(--primary)' : 'var(--text-tertiary)',
                          }}
                        >
                          {b.label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {throwbacks.length > 0 ? (
              <div>
                <div
                  className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <History className="h-3 w-3" aria-hidden />
                  On this day
                </div>
                <ul>
                  {throwbacks.map((t) => (
                    <li key={t.period} className="flex items-baseline gap-4 py-2">
                      <span
                        className="w-[92px] shrink-0 text-[11px] uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {t.period}
                      </span>
                      <span
                        className="min-w-0 flex-1 text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {actionLabel(t.action)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
