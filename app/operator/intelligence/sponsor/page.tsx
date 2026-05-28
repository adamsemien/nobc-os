import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRolePage } from '@/lib/operator-role';
import { getAudienceNarrative } from './actions';
import { SentimentPanel } from './_components/SentimentPanel';
import { SponsorBriefBar } from './_components/SponsorBriefBar';
import { IntelligenceTabs } from '../_components/IntelligenceTabs';

export const dynamic = 'force-dynamic';

const DISPLAY = 'var(--font-display)';

// ============================================================
// Data loaders — each runs its own queries in parallel and is
// dispatched via Promise.allSettled so one failing panel never
// takes down the others (the per-panel "error boundary").
// ============================================================

type NetworkCapital = {
  approvedCount: number;
  tiers: { label: string; count: number }[];
  referralPct: number;
  topTags: { tag: string; count: number }[];
  archetypeAverages: { label: string; avg: number }[];
};

async function loadNetworkCapital(workspaceId: string): Promise<NetworkCapital> {
  const base = { workspaceId, status: 'APPROVED' as const };
  const [approvedCount, highYield, activeContributors, referredCount, members, approvedApps] =
    await Promise.all([
      db.member.count({ where: base }),
      db.member.count({ where: { ...base, networkCapitalScore: { gte: 7 } } }),
      db.member.count({ where: { ...base, networkCapitalScore: { gte: 4, lt: 7 } } }),
      db.member.count({ where: { ...base, referredByMemberId: { not: null } } }),
      db.member.findMany({ where: base, select: { tags: true } }),
      db.application.findMany({ where: base, select: { archetypeScores: true } }),
    ]);

  // "Building History" = score is null or < 4 → everyone not in the upper tiers.
  const buildingHistory = approvedCount - highYield - activeContributors;

  // Top 6 community tags by frequency. Internal seed/demo tags ("__demo",
  // "__demo-tenur", …) are stripped — any "__"-prefixed tag is internal and must
  // never surface in a sponsor-facing view.
  const tagCounts = new Map<string, number>();
  for (const m of members)
    for (const t of m.tags) {
      if (t.startsWith('__')) continue;
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Average each archetype axis present in archetypeScores (0–100 scale).
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const a of approvedApps) {
    const scores = a.archetypeScores as Record<string, number> | null;
    if (!scores) continue;
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v !== 'number') continue;
      sums.set(k, (sums.get(k) ?? 0) + v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  const archetypeAverages = [...sums.entries()]
    .map(([label, sum]) => ({ label, avg: sum / (counts.get(label) || 1) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  return {
    approvedCount,
    tiers: [
      { label: 'High Social Yield', count: highYield },
      { label: 'Active Contributors', count: activeContributors },
      { label: 'Building History', count: buildingHistory },
    ],
    referralPct: approvedCount ? Math.round((referredCount / approvedCount) * 100) : 0,
    topTags,
    archetypeAverages,
  };
}

type Retention = {
  multiEventPct: number;
  avgEventsActive: number | null;
  avgLeadTimeDays: number | null;
  activeLast30: number;
  distribution: { label: string; count: number }[];
};

async function loadRetention(workspaceId: string): Promise<Retention> {
  const base = { workspaceId, status: 'APPROVED' as const };
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const [approvedCount, multiEvent, activeAgg, oneEvent, twoThree, fourPlus, activeLast30, leadEvents] =
    await Promise.all([
      db.member.count({ where: base }),
      db.member.count({ where: { ...base, totalEventsAttended: { gte: 2 } } }),
      db.member.aggregate({
        where: { ...base, totalEventsAttended: { gte: 1 } },
        _avg: { totalEventsAttended: true },
      }),
      db.member.count({ where: { ...base, totalEventsAttended: 1 } }),
      db.member.count({ where: { ...base, totalEventsAttended: { gte: 2, lte: 3 } } }),
      db.member.count({ where: { ...base, totalEventsAttended: { gte: 4 } } }),
      db.member.count({ where: { ...base, lastAttendedDate: { gte: thirtyDaysAgo } } }),
      db.memberEngagementEvent.findMany({
        where: { workspaceId, eventType: 'rsvp_confirmed' },
        select: { metadata: true },
        take: 500,
      }),
    ]);

  // Avg RSVP lead time, if any event carries metadata.leadTimeDays.
  const leadTimes: number[] = [];
  for (const e of leadEvents) {
    const meta = e.metadata as Record<string, unknown> | null;
    const v = meta && typeof meta.leadTimeDays === 'number' ? meta.leadTimeDays : null;
    if (v != null) leadTimes.push(v);
  }

  return {
    multiEventPct: approvedCount ? Math.round((multiEvent / approvedCount) * 100) : 0,
    avgEventsActive: activeAgg._avg.totalEventsAttended ?? null,
    avgLeadTimeDays: leadTimes.length
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : null,
    activeLast30,
    distribution: [
      { label: '1 event', count: oneEvent },
      { label: '2–3 events', count: twoThree },
      { label: '4+ events', count: fourPlus },
    ],
  };
}

// ============================================================
// Presentational primitives (server components) — quiet luxury:
// hairline rules, generous whitespace, square bars, no card shadows.
// ============================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] uppercase" style={{ letterSpacing: '0.26em', color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );
}

function Hairline() {
  return <div className="border-t" style={{ borderColor: 'var(--border)' }} />;
}

/** 8px proportion bar, accent fill on a muted track. */
function ProportionBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[15px]" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span className="text-[14px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {value}
        </span>
      </div>
      <div className="h-2 w-full" style={{ background: 'var(--raised)' }}>
        <div className="h-2" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

/** Frequency bar with relative width and no numbers (community composition). */
function FreqBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 text-[15px]" style={{ color: 'var(--text-primary)' }}>
        {label}
      </div>
      <div className="h-2 w-full" style={{ background: 'var(--raised)' }}>
        <div className="h-2" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}

function PanelError({ label }: { label: string }) {
  return (
    <section className="py-16">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-6 text-[14px] italic" style={{ fontFamily: DISPLAY, color: 'var(--text-tertiary)' }}>
        This panel could not be loaded.
      </p>
    </section>
  );
}

function Header({ memberCount }: { memberCount: number }) {
  const now = new Date();
  const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  return (
    <header className="pb-8">
      <h1 className="text-5xl italic leading-[1.05] md:text-7xl" style={{ fontFamily: DISPLAY, fontWeight: 200 }}>
        Audience Intelligence
      </h1>
      <p className="mt-5 text-[11px] uppercase" style={{ letterSpacing: '0.24em', color: 'var(--text-secondary)' }}>
        No Bad Company · Austin, TX · {memberCount} Members · {monthYear}
      </p>
    </header>
  );
}

// ============================================================
// Panels
// ============================================================

function NetworkCapitalPanel({ data }: { data: NetworkCapital }) {
  const maxTag = data.topTags[0]?.count ?? 0;
  // Multiplier tiers only mean something once members carry a networkCapitalScore.
  // Before any referral data accrues every member falls into "Building History" and
  // the bars read as broken (two empty, one full) — so we show intentional editorial
  // copy in place of the tiers until scoring has something to rank.
  const scoredMembers = data.tiers
    .filter((t) => t.label !== 'Building History')
    .reduce((sum, t) => sum + t.count, 0);
  const hasMultiplierData = scoredMembers > 0;
  const hasComposition = data.topTags.length > 0;
  const hasArchetype = data.archetypeAverages.length > 0;

  return (
    <section className="space-y-16 py-16">
      {/* Row 1 — hero + quote (left) balanced against the multiplier tiers (right).
          Both columns are short, so they pair without leaving a void. */}
      <div className="grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionLabel>Network Capital</SectionLabel>

          <div className="mt-6">
            <div className="text-6xl leading-none" style={{ fontFamily: DISPLAY, fontWeight: 200, color: 'var(--text-primary)' }}>
              {data.approvedCount}
            </div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              approved members
            </div>
          </div>

          {data.referralPct > 0 && (
            <p className="mt-10 text-[15px]" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: '1.5rem', color: 'var(--text-primary)' }}>
                {data.referralPct}%
              </span>{' '}
              arrived through personal referral
            </p>
          )}

          <p className="mt-12 text-2xl italic leading-relaxed" style={{ fontFamily: DISPLAY, color: 'var(--accent)' }}>
            “A room where the most valuable person isn&rsquo;t always the most obvious one.”
          </p>
        </div>

        <div className="lg:col-span-7">
          <SectionLabel>Multiplier Tiers</SectionLabel>
          {hasMultiplierData ? (
            <div className="mt-5 flex flex-col gap-5">
              {data.tiers.map((t) => (
                <ProportionBar key={t.label} label={t.label} value={t.count} total={data.approvedCount} />
              ))}
            </div>
          ) : (
            <p className="mt-5 text-[15px] italic leading-relaxed" style={{ fontFamily: DISPLAY, color: 'var(--text-tertiary)' }}>
              Multiplier scoring activates as referral data accrues.
            </p>
          )}
        </div>
      </div>

      {/* Row 2 — Community Composition + Shared Archetype Profile are independent
          sections, not part of the hero row. Both are bar lists of similar height,
          so they sit full-width as a 2-up instead of being stacked in a half-column. */}
      {(hasComposition || hasArchetype) && (
        <div className="grid grid-cols-1 gap-x-16 gap-y-12 md:grid-cols-2">
          {hasComposition && (
            <div>
              <SectionLabel>Community Composition</SectionLabel>
              <div className="mt-5 flex flex-col gap-4">
                {data.topTags.map((t) => (
                  <FreqBar key={t.tag} label={t.tag} value={t.count} max={maxTag} />
                ))}
              </div>
            </div>
          )}

          {hasArchetype && (
            <div>
              <SectionLabel>Shared Archetype Profile</SectionLabel>
              <div className="mt-5 flex flex-col gap-4">
                {data.archetypeAverages.map((a) => (
                  <div key={a.label}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[15px]" style={{ color: 'var(--text-primary)' }}>
                        {a.label}
                      </span>
                      <span className="text-[14px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                        {Math.round(a.avg)}
                      </span>
                    </div>
                    <div className="h-2 w-full" style={{ background: 'var(--raised)' }}>
                      <div className="h-2" style={{ width: `${Math.min(100, Math.max(0, a.avg))}%`, background: 'var(--accent)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RetentionPanel({ data }: { data: Retention }) {
  const maxDist = Math.max(1, ...data.distribution.map((d) => d.count));
  const avgEvents = data.avgEventsActive != null ? data.avgEventsActive.toFixed(1) : '—';
  const avgLead = data.avgLeadTimeDays != null ? `${Math.round(data.avgLeadTimeDays)}d` : '—';
  return (
    <section className="space-y-16 py-16">
      {/* Row 1 — hero balanced against the supporting stat trio (both short). */}
      <div className="grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionLabel>Retention &amp; Velocity</SectionLabel>
          <div className="mt-6">
            <div className="text-6xl leading-none" style={{ fontFamily: DISPLAY, fontWeight: 200, color: 'var(--text-primary)' }}>
              {data.multiEventPct}%
            </div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
              attended multiple events
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 lg:col-span-7">
          <Stat label="Avg events / active member" value={avgEvents} />
          <Stat label="Avg RSVP lead time" value={avgLead} />
          <Stat label="Active in last 30 days" value={String(data.activeLast30)} />
        </div>
      </div>

      {/* Row 2 — the taller distribution list breaks to full width instead of being
          trapped in a half-column under the hero. */}
      <div>
        <SectionLabel>Attendance Distribution</SectionLabel>
        <div className="mt-5 flex flex-col gap-4">
          {data.distribution.map((d) => (
            <FreqBar key={d.label} label={d.label} value={d.count} max={maxDist} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl leading-none" style={{ fontFamily: DISPLAY, fontWeight: 200, color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="mt-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
    </div>
  );
}

// ============================================================
// Page
// ============================================================

/** Unwrap an allSettled panel result, logging (never silently swallowing) a
 *  rejection so a failing panel is traceable in production logs instead of just
 *  showing "could not be loaded" with no clue why. */
function panelValue<T>(settled: PromiseSettledResult<T>, label: string): T | null {
  if (settled.status === 'fulfilled') return settled.value;
  console.error(`[sponsor-intelligence] ${label} failed to load:`, settled.reason);
  return null;
}

export default async function SponsorIntelligencePage() {
  // ADMIN-only, matching the adminOnly "Sponsors" nav item. Safe now that
  // getEffectiveRole treats a Clerk org admin as ADMIN even with no
  // WorkspaceMember row — the lockout that 48ceff7 worked around is fixed at the
  // source (lib/operator-role.ts). Workspace scoping unchanged; every query below
  // filters by this workspaceId.
  const { workspaceId } = await requireRolePage(OperatorRole.ADMIN);

  const approvedCount = await db.member.count({ where: { workspaceId, status: 'APPROVED' } });

  if (approvedCount < 5) {
    return (
      <div className="min-h-screen px-6 py-10 md:px-12" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
        <IntelligenceTabs isAdmin={true} />
        <Header memberCount={approvedCount} />
        <Hairline />
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="max-w-md text-center text-2xl italic" style={{ fontFamily: DISPLAY, color: 'var(--text-tertiary)' }}>
            Intelligence builds as your community grows.
          </p>
        </div>
      </div>
    );
  }

  // All panel data + the cached narrative load in parallel; allSettled isolates
  // a failure to its own panel.
  const [networkSettled, retentionSettled, narrativeSettled] = await Promise.allSettled([
    loadNetworkCapital(workspaceId),
    loadRetention(workspaceId),
    getAudienceNarrative(workspaceId),
  ]);

  const network = panelValue(networkSettled, 'Network Capital');
  const retention = panelValue(retentionSettled, 'Retention & Velocity');
  const initialNarrative = panelValue(narrativeSettled, 'Sentiment narrative');

  return (
    <div className="min-h-screen px-6 py-10 md:px-12" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <IntelligenceTabs isAdmin={true} />
      <Header memberCount={approvedCount} />
      <Hairline />

      {network ? <NetworkCapitalPanel data={network} /> : <PanelError label="Network Capital" />}
      <Hairline />

      {retention ? <RetentionPanel data={retention} /> : <PanelError label="Retention & Velocity" />}
      <Hairline />

      <SentimentPanel workspaceId={workspaceId} initialNarrative={initialNarrative} />

      <SponsorBriefBar />
    </div>
  );
}
