import Link from 'next/link';
import { OperatorRole } from '@prisma/client';
import { requireRolePage, roleAtLeast } from '@/lib/operator-role';
import { assembleMemberRecord } from '@/lib/member-record';
import { PageHeader } from '../../_components/PageHeader';
import { Avatar } from '../../_components/Avatar';
import { ScoreBadge } from '../../_components/ScoreBadge';
import { CommentThread } from '@/components/comments/CommentThread';
import { MemberRecordHeader } from '../_components/MemberRecordHeader';
import { MemberTimeline } from '../_components/MemberTimeline';
import { ProvenanceBadge } from '../_components/ProvenanceBadge';

// PR3 Slice 1 — read experience (F1 identity/status, F2 timeline, F3 provenance). Server
// shell: role-gates the page, assembles the record directly (no self-HTTP), and hands the
// timeline island its initialData. Psychographics is NOT read or rendered here (Slice 3);
// includePsychographics is wired to the STAFF gate purely for cache/API consistency.

const REC_LABEL: Record<string, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  unclear: 'Unclear',
  no: 'No',
  strong_no: 'Strong no',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export default async function MemberRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { workspaceId, role } = await requireRolePage(OperatorRole.READ_ONLY);

  const record = await assembleMemberRecord({
    workspaceId,
    memberId: id,
    includePsychographics: roleAtLeast(role, OperatorRole.STAFF),
  });

  if (!record) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Member not found.{' '}
        <Link href="/operator/members" className="text-primary underline">
          Back
        </Link>
      </div>
    );
  }

  const m = record.member;
  const fullName = `${m.firstName} ${m.lastName}`.trim() || m.email;
  const fm = record.dimensions.firmographic;
  const dm = record.dimensions.demographic;
  const prov = (record.fieldProvenance ?? {}) as Record<string, { source?: string } | undefined>;
  const customEntries = Object.entries(record.customFields ?? {});

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: fullName }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={fullName} email={m.email} size={44} />
            <span>{fullName}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={`mailto:${m.email}`} className="underline-offset-2 hover:underline">
              {m.email}
            </a>
            {m.phone ? <span>· {m.phone}</span> : null}
          </span>
        }
      />

      <MemberRecordHeader record={record} />

      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="lg:flex lg:flex-col">
          <div className="rounded-lg border border-border bg-card p-5 lg:flex lg:flex-1 lg:flex-col">
            <CardLabel>Activity</CardLabel>
            <MemberTimeline memberId={id} initialData={record} />
          </div>
        </section>

        <aside className="space-y-5">
          {record.intelligence ? (
            <Card>
              <CardLabel>Assessment</CardLabel>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ScoreBadge value={record.intelligence.aiScore} size="lg" />
                {record.intelligence.aiRecommendation ? (
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                    {REC_LABEL[record.intelligence.aiRecommendation] ?? record.intelligence.aiRecommendation}
                  </span>
                ) : null}
              </div>
              {record.intelligence.aiReasoning ? (
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  {record.intelligence.aiReasoning}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardLabel>Profile</CardLabel>
            <dl className="mt-2 space-y-2">
              {fm.companyName ? (
                <Row label="Company">
                  {fm.companyName}
                  {fm.jobFunction ? ` · ${fm.jobFunction}` : ''}
                </Row>
              ) : null}
              {fm.seniority ? <Row label="Seniority">{fm.seniority}</Row> : null}
              {fm.industry ? <Row label="Industry">{fm.industry}</Row> : null}
              {dm.city || dm.country ? (
                <Row label="Location">{[dm.city, dm.country].filter(Boolean).join(', ')}</Row>
              ) : null}
              {fm.linkedinUrl ? (
                <Row label="LinkedIn">
                  <a href={fm.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    Profile
                  </a>
                </Row>
              ) : null}
              {fm.instagram ? <Row label="Instagram">@{fm.instagram.replace(/^@/, '')}</Row> : null}
              <Row label="Joined">{fmtDate(m.createdAt)}</Row>
              {m.approvedAt ? <Row label="Approved">{fmtDate(m.approvedAt)}</Row> : null}
            </dl>
          </Card>

          {customEntries.length > 0 ? (
            <Card>
              <CardLabel>Fields</CardLabel>
              <ul className="mt-2 space-y-3">
                {customEntries.map(([key, value]) => (
                  <li key={key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-muted">{humanizeKey(key)}</span>
                      {prov[key]?.source ? <ProvenanceBadge source={prov[key]!.source!} /> : null}
                    </div>
                    <div className="text-sm text-text-primary">{formatValue(value)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {m.aiSummary ? (
            <Card>
              <CardLabel>AI summary</CardLabel>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{m.aiSummary}</p>
            </Card>
          ) : null}

          <Card>
            <CommentThread entityType="member" entityId={m.id} />
          </Card>
        </aside>
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
