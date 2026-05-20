import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Inbox,
  Users,
  CalendarDays,
  ScanLine,
  ArrowRight,
  Sparkles,
  Cake,
  History,
} from 'lucide-react';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { PageHeader } from './_components/PageHeader';
import { Avatar } from './_components/Avatar';
import { ScoreBadge } from './_components/ScoreBadge';

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

function formatRelativeTime(iso: Date): string {
  const ms = Date.now() - iso.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\./g, ' › ');
}

function actionColor(action: string): string {
  if (action.startsWith('application.approved')) return 'var(--success)';
  if (action.startsWith('application.rejected')) return 'var(--danger)';
  if (action.startsWith('rsvp.refunded')) return 'var(--warning)';
  if (action.startsWith('rsvp.confirmed') || action.startsWith('rsvp.checked_in')) return 'var(--primary)';
  return 'var(--text-secondary)';
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

  // Capacity counts for the 3 upcoming events
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

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1280px]">
        <PageHeader
          title="Tonight, tomorrow, this week"
          subtitle="Everything you need to run No Bad Company."
        />

        {/* Hero stats */}
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={<Inbox className="h-4 w-4" />}
            label="Pending Applications"
            value={pendingCount}
            href="/operator/applications"
            actionLabel="Review →"
            accent={pendingCount > 0}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Members"
            value={memberCount}
            href="/operator/members"
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Upcoming this week"
            value={upcomingThisWeek}
            href="/operator/events"
          />
          <StatCard
            icon={<ScanLine className="h-4 w-4" />}
            label="Checked in today"
            value={checkedInToday}
            href="/operator/check-in"
          />
        </section>

        {/* Action required */}
        {(pendingApps.length > 0 || todaysEvents.length > 0) ? (
          <section className="mb-8 rounded-lg border border-primary/30 bg-primary-soft/40 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
                Action required
              </h2>
            </div>

            {todaysEvents.length > 0 ? (
              <div className="mb-4 space-y-2">
                {todaysEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-card p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/operator/events/${e.id}`}
                        className="block truncate text-sm font-semibold text-text-primary hover:text-primary"
                      >
                        Tonight: {e.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-text-muted">
                        {fmtTime(e.startAt)}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`/check-in/${e.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary hover:border-primary hover:text-primary"
                      >
                        Check In
                      </a>
                      <Link
                        href={`/operator/events/${e.id}/room`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                      >
                        The Room →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {pendingApps.length > 0 ? (
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.14em] text-text-muted">
                  Waiting on you
                </div>
                <ul className="space-y-1.5">
                  {pendingApps.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/operator/applications/${a.id}`}
                        className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-card"
                      >
                        <Avatar name={a.fullName} email={a.email} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-text-primary">{a.fullName}</div>
                          <div className="truncate text-xs text-text-muted">
                            {a.archetype ?? 'archetype TBD'}
                            {a.city ? ` · ${a.city}` : ''}
                          </div>
                        </div>
                        <ScoreBadge value={a.aiScore} size="sm" />
                        <span className="hidden text-xs text-text-muted sm:inline">
                          {formatRelativeTime(a.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {(birthdays.length > 0 || throwbacks.length > 0) ? (
          <section className="mb-8 grid gap-3 lg:grid-cols-2">
            {birthdays.length > 0 ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <Cake className="h-3.5 w-3.5" aria-hidden />
                  Birthdays this week
                </div>
                <ul className="space-y-1.5">
                  {birthdays.map((b) => (
                    <li key={b.memberId}>
                      <Link
                        href={`/operator/members/${b.memberId}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg"
                      >
                        <span className="truncate text-text-primary">{b.name}</span>
                        <span
                          className="ml-2 shrink-0 text-xs font-medium"
                          style={{ color: b.days === 0 ? 'var(--primary)' : 'var(--text-secondary)' }}
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
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  On this day
                </div>
                <ul className="space-y-1.5">
                  {throwbacks.map((t) => (
                    <li key={t.period} className="flex items-baseline gap-3 px-2 py-1">
                      <span className="w-[88px] shrink-0 text-xs text-text-muted">{t.period}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        {actionLabel(t.action)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Upcoming + Activity */}
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section>
            <SectionLabel
              title="Upcoming events"
              action={<Link href="/operator/events" className="text-xs font-medium text-primary">All events →</Link>}
            />
            {upcomingEventsFull.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm text-text-secondary">No upcoming events.</p>
                <Link
                  href="/operator/events/new"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
                >
                  Create one →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEventsFull.map((e) => {
                  const confirmed = confirmedByEvent.get(e.id) ?? 0;
                  const fillPct =
                    e.capacity && e.capacity > 0 ? Math.min(100, Math.round((confirmed / e.capacity) * 100)) : 0;
                  return (
                    <div key={e.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <Link
                          href={`/operator/events/${e.id}`}
                          className="text-base font-semibold text-text-primary hover:text-primary"
                        >
                          {e.title}
                        </Link>
                        <div className="text-xs text-text-muted">
                          {fmtDate(e.startAt)} · {fmtTime(e.startAt)}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.14em] text-text-muted">
                            <span>confirmed</span>
                            <span className="text-sm font-semibold tabular-nums text-text-primary">
                              {confirmed}
                              {e.capacity != null ? <span className="text-text-muted">/{e.capacity}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <a
                            href={`/check-in/${e.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary hover:border-primary hover:text-primary"
                          >
                            Check In
                          </a>
                          <Link
                            href={`/operator/events/${e.id}/room`}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                          >
                            The Room →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionLabel
              title="Recent activity"
              action={<Link href="/operator/audit" className="text-xs font-medium text-primary">Full log →</Link>}
            />
            {recentAudit.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-text-muted">
                Nothing has happened yet.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {recentAudit.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: actionColor(e.action) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {actionLabel(e.action)}
                      </div>
                      <div className="text-xs text-text-muted">
                        {e.entityType.toLowerCase()} · {formatRelativeTime(e.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  actionLabel,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  actionLabel?: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        'group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors ' +
        (accent ? 'border-primary/40' : 'border-border hover:border-primary/40')
      }
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
        <span style={{ color: accent ? 'var(--primary)' : 'var(--text-muted)' }}>{icon}</span>
        {label}
      </div>
      <div
        className="text-3xl font-semibold tabular-nums leading-none"
        style={{
          color: accent ? 'var(--primary)' : 'var(--text-primary)',
          fontFamily: 'var(--font-display, "PP Editorial New", Georgia, serif)',
        }}
      >
        {value}
      </div>
      <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
        {actionLabel ?? 'View'}
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function SectionLabel({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</h2>
      {action}
    </div>
  );
}
