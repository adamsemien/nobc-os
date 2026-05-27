import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../../_components/PageHeader';
import { Avatar } from '../../_components/Avatar';
import { ScoreBadge } from '../../_components/ScoreBadge';
import { CommentThread } from '@/components/comments/CommentThread';

type Detail = {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: string;
    tags: string[];
    energyScore: number | null;
    networkValueScore: number | null;
    aiSummary: string | null;
    totalEventsAttended: number;
    lastAttendedDate: string | null;
    createdAt: string;
    approvedAt: string | null;
  };
  application: {
    id: string;
    archetype: string | null;
    aiScore: number | null;
    aiReasoning: string | null;
    aiRecommendation: string | null;
    city: string | null;
    neighborhood: string | null;
    referredBy: string | null;
    createdAt: string;
    status: string;
  } | null;
  rsvps: Array<{
    id: string;
    status: string;
    checkedIn: boolean;
    checkedInAt: string | null;
    event: { id: string; title: string; slug: string; startAt: string };
  }>;
  watch: { type: string; note: string | null; createdAt: Date } | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await operatorServerFetch(`/api/operator/members/${id}`);

  if (res.status === 404) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Member not found.{' '}
        <Link href="/operator/members" className="text-primary underline">
          Back
        </Link>
      </div>
    );
  }
  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load member.
      </div>
    );
  }

  const { member, application, rsvps, watch } = (await res.json()) as Detail;
  const fullName = `${member.firstName} ${member.lastName}`.trim() || member.email;

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          crumbs={[
            { href: '/operator/members', label: 'Members' },
            { label: fullName },
          ]}
          title={
            <span className="flex items-center gap-3">
              <Avatar name={fullName} email={member.email} size={44} />
              <span>{fullName}</span>
            </span>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-3">
              <a href={`mailto:${member.email}`} className="underline-offset-2 hover:underline">{member.email}</a>
              {member.phone ? <span>· {member.phone}</span> : null}
              {watch?.type === 'PURPLE' ? <span className="text-[#C7A7DE]">· ✦ Purple</span> : null}
              {watch?.type === 'BLOCKED' ? <span className="text-danger">· Blocked</span> : null}
            </span>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-5">
            <Card>
              <CardLabel>Score</CardLabel>
              <div className="mt-2 flex items-center gap-4">
                <ScoreBadge value={application?.aiScore ?? null} size="lg" />
                {application?.archetype ? (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                    {application.archetype}
                  </span>
                ) : null}
              </div>
              {application?.aiReasoning ? (
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  {application.aiReasoning}
                </p>
              ) : null}
            </Card>

            <Card>
              <CardLabel>Recent activity</CardLabel>
              {rsvps.length === 0 ? (
                <p className="mt-3 text-sm text-text-muted">No RSVPs yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {rsvps.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                      <div className="min-w-0">
                        <Link
                          href={`/operator/events/${r.event.id}`}
                          className="block truncate font-medium text-text-primary hover:text-primary"
                        >
                          {r.event.title}
                        </Link>
                        <div className="text-xs text-text-muted">{fmtDate(r.event.startAt)}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <div className="text-text-secondary">
                          {r.status.toLowerCase()}
                        </div>
                        {r.checkedIn ? (
                          <div className="text-success">checked in</div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <aside className="space-y-5">
            <Card>
              <CardLabel>Profile</CardLabel>
              <dl className="mt-2 space-y-2 text-sm text-text-primary">
                <Row label="Status">{member.status.toLowerCase()}</Row>
                {application?.city ? <Row label="City">{application.city}{application.neighborhood ? `, ${application.neighborhood}` : ''}</Row> : null}
                {application?.referredBy ? <Row label="Referred by">{application.referredBy}</Row> : null}
                <Row label="Joined">{fmtDate(member.createdAt)}</Row>
                {member.approvedAt ? <Row label="Approved">{fmtDate(member.approvedAt)}</Row> : null}
                <Row label="Events attended">{member.totalEventsAttended}</Row>
                <Row label="Last seen">{fmtDate(member.lastAttendedDate)}</Row>
              </dl>
            </Card>

            {member.aiSummary ? (
              <Card>
                <CardLabel>AI summary</CardLabel>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {member.aiSummary}
                </p>
              </Card>
            ) : null}

            <Card>
              <CommentThread entityType="member" entityId={member.id} />
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-5">{children}</div>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{children}</dd>
    </div>
  );
}
