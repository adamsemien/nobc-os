'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Donut, VBars } from './charts';

const HEADING_FONT = 'var(--font-pp-editorial, Georgia, serif)';

// Topic label → chart color. Reuses the theme's archetype palette so segments
// stay distinct without any hex literals (CLAUDE.md: semantic CSS vars only).
const CATEGORY_COLORS: Record<string, string> = {
  'Guest List': 'var(--archetype-connector)',
  Parking: 'var(--archetype-host)',
  'Timing & Doors': 'var(--archetype-curator)',
  'General Question': 'var(--archetype-builder)',
  'RSVP Help': 'var(--archetype-maker)',
  'Venue Info': 'var(--archetype-patron)',
  Other: 'var(--text-tertiary)',
};

const CONTACT_COLORS: Record<string, string> = {
  Member: 'var(--success)',
  Guest: 'var(--accent)',
  Unknown: 'var(--text-tertiary)',
};

type Analytics = {
  volume: {
    totalConversations: number;
    textsThisMonth: number;
    textsThisWeek: number;
    byDay: { label: string; value: number }[];
    peakHours: { hour: number; count: number }[];
  };
  topics: {
    categories: { label: string; value: number }[];
    uncategorizedRemaining: number;
    topMessages: { body: string; count: number }[];
  };
  contacts: {
    uniquePhones: number;
    known: number;
    unknown: number;
    breakdown: { label: string; value: number }[];
    nameCaptureRate: number;
    newThisMonth: number;
  };
  response: {
    aiAutoReplyRate: number;
    totalOutbound: number;
    avgMessagesPerConversation: number;
    conversationsNoReply: number;
  };
};

function Card({ span, children }: { span: string; children: ReactNode }) {
  return (
    <div className={span}>
      <div
        className="flex h-full flex-col rounded-[12px] p-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  span = 'col-span-6 lg:col-span-3',
}: {
  label: string;
  value: string | number;
  hint?: string;
  span?: string;
}) {
  return (
    <Card span={span}>
      <h3 className="text-[15px] italic leading-tight" style={{ fontFamily: HEADING_FONT, fontWeight: 200 }}>
        {label}
      </h3>
      {hint && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {hint}
        </p>
      )}
      <div className="mt-3 text-[34px] font-semibold leading-none" style={{ color: 'var(--accent)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  hint,
  span,
  children,
}: {
  title: string;
  hint?: string;
  span: string;
  children: ReactNode;
}) {
  return (
    <Card span={span}>
      <div className="mb-3">
        <h3 className="text-[19px] italic leading-tight" style={{ fontFamily: HEADING_FONT, fontWeight: 200 }}>
          {title}
        </h3>
        {hint && (
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {hint}
          </p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}

function SectionTitle({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <h2
      className={`${first ? 'mb-3' : 'mb-3 mt-8'} text-[22px] italic leading-tight`}
      style={{ fontFamily: HEADING_FONT, fontWeight: 200, color: 'var(--text-primary)' }}
    >
      {children}
    </h2>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </p>
  );
}

function DonutWithLegend({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  if (total === 0) return <Empty>No data yet.</Empty>;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <Donut segments={shown} />
      <div className="flex flex-col gap-1.5">
        {shown.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-[10px] w-[10px] rounded-full" style={{ background: s.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtHour(h: number): string {
  const period = h < 12 ? 'a' : 'p';
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v}${period}`;
}

function PeakHours({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0] ?? { hour: 0, count: 0 });
  if (total === 0) return <Empty>No inbound texts yet.</Empty>;
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
        {data.map(({ hour, count }) => (
          <div
            key={hour}
            title={`${fmtHour(hour)} — ${count} text${count === 1 ? '' : 's'}`}
            className="h-8 rounded-[3px]"
            style={{ background: 'var(--accent)', opacity: 0.08 + (count / max) * 0.92 }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
      <p className="mt-3 text-[12px] italic" style={{ color: 'var(--text-secondary)' }}>
        Busiest around {fmtHour(peak.hour)}.
      </p>
    </div>
  );
}

export function HousePhonePanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Debounce the tab-load fetch so a quick re-mount (e.g. React strict mode,
    // fast tab toggling) doesn't fire duplicate categorization jobs.
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/sms/analytics');
        if (!res.ok) throw new Error('analytics failed');
        const json = (await res.json()) as Analytics;
        if (cancelled) return;
        setData(json);
        setLoading(false);

        // Categorize uncategorized inbound messages in the background, then
        // refresh topics if anything was newly labeled.
        const cat = await fetch('/api/sms/categorize');
        if (cancelled || !cat.ok) return;
        const catJson = (await cat.json()) as { categorized?: number };
        if ((catJson.categorized ?? 0) > 0) {
          const res2 = await fetch('/api/sms/analytics');
          if (!cancelled && res2.ok) setData((await res2.json()) as Analytics);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (loading) {
    return (
      <p className="py-16 text-center text-[14px]" style={{ color: 'var(--text-tertiary)' }}>
        Loading House Phone analytics…
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="py-16 text-center text-[14px]" style={{ color: 'var(--text-tertiary)' }}>
        Couldn’t load House Phone analytics. Try again shortly.
      </p>
    );
  }

  const { volume, topics, contacts, response } = data;

  if (volume.totalConversations === 0) {
    return (
      <p className="py-16 text-center text-[14px]" style={{ color: 'var(--text-tertiary)' }}>
        No House Phone activity yet. Conversations appear here once members start texting.
      </p>
    );
  }

  // Display-only rename: 'RSVP Help' is the stored SmsMessage.category value
  // (renaming it server-side would fork historical rows into two buckets), but
  // the terminology law bans "RSVP" in operator copy — so map at render.
  const categorySegments = topics.categories.map((c) => ({
    label: c.label === 'RSVP Help' ? 'Access Help' : c.label,
    value: c.value,
    color: CATEGORY_COLORS[c.label] ?? 'var(--accent)',
  }));
  const contactSegments = contacts.breakdown.map((b) => ({
    label: b.label,
    value: b.value,
    color: CONTACT_COLORS[b.label] ?? 'var(--accent)',
  }));

  return (
    <div>
      {/* VOLUME */}
      <SectionTitle first>Volume</SectionTitle>
      <div className="grid grid-cols-12 gap-4">
        <StatCard label="Total conversations" hint="All time" value={volume.totalConversations} />
        <StatCard label="Texts received" hint="This month" value={volume.textsThisMonth} />
        <StatCard label="Texts received" hint="This week" value={volume.textsThisWeek} />
        <StatCard
          label="Avg / conversation"
          hint="Messages"
          value={response.avgMessagesPerConversation}
        />
        <ChartCard title="Inbound by day" hint="Last 14 days" span="col-span-12 lg:col-span-6">
          <VBars items={volume.byDay} />
          <div className="mt-2 flex justify-between text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>{volume.byDay[0]?.label}</span>
            <span>{volume.byDay[volume.byDay.length - 1]?.label}</span>
          </div>
        </ChartCard>
        <ChartCard title="Peak hours" hint="When texts arrive (by hour)" span="col-span-12 lg:col-span-6">
          <PeakHours data={volume.peakHours} />
        </ChartCard>
      </div>

      {/* TOPICS */}
      <SectionTitle>Topics</SectionTitle>
      <div className="grid grid-cols-12 gap-4">
        <ChartCard
          title="What members text about"
          hint="AI-categorized inbound messages"
          span="col-span-12 lg:col-span-6"
        >
          <DonutWithLegend segments={categorySegments} />
          {topics.uncategorizedRemaining > 0 && (
            <p className="mt-3 text-[11px] italic" style={{ color: 'var(--text-tertiary)' }}>
              {topics.uncategorizedRemaining.toLocaleString()} awaiting categorization — refresh shortly.
            </p>
          )}
        </ChartCard>
        <ChartCard
          title="Most common messages"
          hint="Top 5 inbound (anonymized)"
          span="col-span-12 lg:col-span-6"
        >
          {topics.topMessages.length === 0 ? (
            <Empty>No inbound messages yet.</Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {topics.topMessages.map((m, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    “{m.body}”
                  </span>
                  <span
                    className="shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium tabular-nums"
                    style={{ background: 'var(--raised)', color: 'var(--text-primary)' }}
                  >
                    ×{m.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* CONTACT INSIGHTS */}
      <SectionTitle>Contact insights</SectionTitle>
      <div className="grid grid-cols-12 gap-4">
        <StatCard label="Unique numbers" hint="All time" value={contacts.uniquePhones} />
        <StatCard label="New contacts" hint="This month" value={contacts.newThisMonth} />
        <StatCard label="Name capture" hint="Conversations with a name" value={`${contacts.nameCaptureRate}%`} />
        <StatCard label="Known contacts" hint={`${contacts.unknown} unknown`} value={contacts.known} />
        <ChartCard
          title="Who's texting"
          hint="Matched to a member by phone number"
          span="col-span-12 lg:col-span-6"
        >
          <DonutWithLegend segments={contactSegments} />
        </ChartCard>
      </div>

      {/* RESPONSE STATS */}
      <SectionTitle>Response stats</SectionTitle>
      <div className="grid grid-cols-12 gap-4">
        <StatCard
          label="AI auto-reply rate"
          hint={`${response.totalOutbound.toLocaleString()} outbound`}
          value={`${response.aiAutoReplyRate}%`}
        />
        <StatCard
          label="Avg messages"
          hint="Per conversation"
          value={response.avgMessagesPerConversation}
        />
        <StatCard
          label="No reply"
          hint="Inbound, never answered"
          value={response.conversationsNoReply}
        />
      </div>
    </div>
  );
}
