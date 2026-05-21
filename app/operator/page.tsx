import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, ArrowRight, Calendar, CalendarDays, MoonStar, TrendingUp } from 'lucide-react';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { Avatar } from './_components/Avatar';
import { GlassPanel } from './_components/dashboard/GlassPanel';
import { StatFigure } from './_components/dashboard/StatFigure';
import { SectionHeader } from './_components/dashboard/SectionHeader';
import { CapacityBar } from './_components/dashboard/CapacityBar';
import { ActivityRow } from './_components/dashboard/ActivityRow';
import { TonightPanel } from './_components/dashboard/TonightPanel';
import { DeskClock } from './_components/dashboard/DeskClock';
import { LiquidAmbient } from './_components/dashboard/LiquidAmbient';
import { fmtDate, fmtTime } from './_components/dashboard/format';

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

  // The dashboard is a morning brief, not a live event surface — it intentionally
  // does NOT fetch check-in / capacity data (that lives in The Room). Birthdays
  // and throwbacks are still fetched (last two) but not rendered in this layout.
  const [
    pendingCount,
    pendingApps,
    memberCount,
    upcomingThisWeek,
    todaysEvents,
    upcomingEventsFull,
    recentAudit,
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
  const weekday = today.toLocaleDateString('en-US', { weekday: 'short' });
  const monthShort = today.toLocaleDateString('en-US', { month: 'short' });
  const dateLine = `${weekday} ${today.getDate()} ${monthShort} ${today.getFullYear()}`;

  return (
    <>
      <LiquidAmbient />
      <div className="relative z-10 flex min-h-screen w-full flex-1 flex-col px-6 pb-12 pt-[38px] sm:px-10 lg:px-14 xl:px-20">
        {/* MASTHEAD */}
        <header
          className="op-rise flex flex-wrap items-end justify-between gap-10 border-b pb-[22px]"
          style={{ borderColor: 'var(--border)', animationDelay: '0.05s' }}
        >
          <div className="min-w-0">
            <div
              className="mb-[18px] text-[13px] font-medium uppercase tracking-[0.2em]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              The operator&rsquo;s desk ·{' '}
              <b style={{ color: 'var(--primary)', fontWeight: 600 }}>{dateLine}</b>
            </div>
            <h1
              className="text-[clamp(3.4rem,6.4vw,6rem)] leading-[0.92]"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 360,
                letterSpacing: '-0.022em',
                color: 'var(--text-primary)',
              }}
            >
              Tonight, tomorrow,
              <br />
              this week<span style={{ color: 'var(--primary)' }}>.</span>
            </h1>
            <div
              className="mt-[14px] text-[18px] italic"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                color: 'var(--text-secondary)',
              }}
            >
              Everything you need to run the night.
            </div>
          </div>
          <DeskClock sub="Austin, TX" />
        </header>

        {/* FIGURES — asymmetric: Pending (lead) + Members / Upcoming stacked */}
        <section className="mt-[34px] grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-[1.5fr_1fr]">
          <StatFigure
            variant="lead"
            eyebrow="Pending applications"
            value={pendingCount}
            accentValue
            className="op-rise md:col-span-2 lg:col-span-1 lg:row-span-2"
            footer={
              <>
                <div
                  className="mt-1 text-[17px] italic"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}
                >
                  awaiting your decision
                </div>
                {pendingApps.length > 0 ? (
                  <div className="mt-auto flex pt-6">
                    {pendingApps.slice(0, 3).map((a, i) => (
                      <span
                        key={a.id}
                        className={`inline-flex rounded-full ${i > 0 ? '-ml-[9px]' : ''}`}
                        style={{ boxShadow: '0 0 0 2px var(--surface)' }}
                      >
                        <Avatar name={a.fullName} email={a.email} size={36} />
                      </span>
                    ))}
                  </div>
                ) : null}
                <Link
                  href="/operator/applications"
                  className="mt-[22px] inline-flex items-center gap-2 self-start rounded-[30px] px-5 py-[11px] text-[13px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
                >
                  Review the queue
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </>
            }
          />

          <StatFigure
            variant="sm"
            eyebrow="Members"
            value={memberCount}
            className="op-rise"
            footer={
              <div
                className="mt-2 flex items-center gap-[5px] text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <TrendingUp className="h-4 w-4" style={{ color: 'var(--success)' }} aria-hidden />
                the room, growing
              </div>
            }
          />

          <StatFigure
            variant="sm"
            eyebrow="Upcoming this week"
            value={upcomingThisWeek}
            className="op-rise"
            footer={
              <div
                className="mt-2 flex items-center gap-[5px] text-[13px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Calendar className="h-4 w-4" aria-hidden />
                on the schedule
              </div>
            }
          />
        </section>

        {/* TONIGHT */}
        {todaysEvents.length > 0 ? (
          <div className="mt-[42px]">
            <div className="op-rise" style={{ animationDelay: '0.36s' }}>
              <SectionHeader icon={<MoonStar className="h-[15px] w-[15px]" />} title="Tonight" />
            </div>
            <div className="op-rise" style={{ animationDelay: '0.4s' }}>
              <TonightPanel events={todaysEvents} />
            </div>
          </div>
        ) : null}

        {/* LOWER — asymmetric: events + activity. Grows to fill remaining height. */}
        <div className="mt-[42px] grid flex-1 grid-cols-1 gap-[18px] lg:grid-cols-[1.62fr_1fr] lg:grid-rows-[minmax(0,1fr)]">
          <div className="op-rise flex flex-col" style={{ animationDelay: '0.46s' }}>
            <SectionHeader
              icon={<CalendarDays className="h-[15px] w-[15px]" />}
              title="Upcoming events"
              action={
                <Link
                  href="/operator/events"
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--primary)' }}
                >
                  All events →
                </Link>
              }
            />
            {upcomingEventsFull.length === 0 ? (
              <GlassPanel className="flex flex-1 flex-col px-[26px] py-10">
                <p
                  className="italic"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}
                >
                  No upcoming events.
                </p>
                <Link
                  href="/operator/events/new"
                  className="mt-3 inline-block text-sm"
                  style={{ color: 'var(--primary)' }}
                >
                  Create one →
                </Link>
              </GlassPanel>
            ) : (
              <GlassPanel className="flex-1 px-[26px] pb-[18px] pt-2">
                {upcomingEventsFull.map((e, i) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-[22px] py-[22px]"
                    style={
                      i < upcomingEventsFull.length - 1
                        ? { borderBottom: '1px solid var(--border)' }
                        : undefined
                    }
                  >
                    <div
                      className="w-6 shrink-0 text-[15px] italic"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--text-tertiary)' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-[21px]"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 400,
                          letterSpacing: '-0.01em',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {e.title}
                      </h4>
                      <div
                        className="mt-[3px] text-[13px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {fmtDate(e.startAt)} · {fmtTime(e.startAt)}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                      <div className="mt-[11px]">
                        <CapacityBar
                          confirmed={confirmedByEvent.get(e.id) ?? 0}
                          capacity={e.capacity}
                        />
                      </div>
                    </div>
                    <Link href={`/operator/events/${e.id}`} className="op-btn shrink-0">
                      Open
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                ))}
              </GlassPanel>
            )}
          </div>

          <div className="op-rise flex flex-col" style={{ animationDelay: '0.56s' }}>
            <SectionHeader
              icon={<Activity className="h-[15px] w-[15px]" />}
              title="Recent activity"
              action={
                <Link
                  href="/operator/audit"
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--primary)' }}
                >
                  Full log →
                </Link>
              }
            />
            {recentAudit.length === 0 ? (
              <GlassPanel className="flex flex-1 flex-col px-6 py-6">
                <p
                  className="italic"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-secondary)' }}
                >
                  Nothing has happened yet.
                </p>
              </GlassPanel>
            ) : (
              <GlassPanel className="flex-1 px-6 pb-[14px] pt-2">
                {recentAudit.map((e, i) => (
                  <ActivityRow
                    key={e.id}
                    action={e.action}
                    createdAt={e.createdAt}
                    last={i === recentAudit.length - 1}
                  />
                ))}
              </GlassPanel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
