/**
 * Member record status strip (member-intelligence PR3, F1). Sits under the page title and
 * carries lifecycle, Red List, merge state, and the at-a-glance stat rail. Identity
 * (avatar / name / email) lives in the page's PageHeader, consistent with every other
 * operator detail page — this strip is the status layer beneath it. Design tokens only.
 */
import Link from 'next/link';
import type { MemberRecord } from '@/lib/member-record';
import { LifecycleBadge } from './LifecycleBadge';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const RED_LIST_LABEL: Record<string, { label: string; cls: string }> = {
  PURPLE: { label: 'Purple List', cls: 'bg-warning-soft text-warning' },
  BLOCKED: { label: 'Blocked', cls: 'bg-danger-soft text-danger' },
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
    </div>
  );
}

export function MemberRecordHeader({ record }: { record: MemberRecord }) {
  const m = record.member;
  const redList = record.redList ? RED_LIST_LABEL[record.redList.type] : null;

  return (
    <div className="space-y-4">
      {m.mergedIntoId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="font-medium">This record was merged into another.</span>
          <Link
            href={`/operator/members/${m.mergedIntoId}`}
            className="underline underline-offset-2 hover:no-underline"
          >
            Open the canonical record
          </Link>
          <span className="text-text-secondary">· editing is disabled here</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <LifecycleBadge status={m.status} />
        {redList ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${redList.cls}`}
            title={record.redList?.note ?? undefined}
          >
            {redList.label}
          </span>
        ) : null}
        {m.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-secondary"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card px-5 py-4 sm:grid-cols-4">
        <Stat label="Member since" value={fmtDate(m.createdAt)} />
        <Stat label="Events attended" value={m.totalEventsAttended} />
        <Stat label="Last seen" value={fmtDate(m.lastAttendedDate)} />
        <Stat
          label="Enrichment"
          value={
            <span className="capitalize">{m.enrichmentStatus.toLowerCase()}</span>
          }
        />
      </div>
    </div>
  );
}
