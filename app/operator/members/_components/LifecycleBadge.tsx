/**
 * Member lifecycle pill (member-intelligence PR3, F1). Maps the raw MemberStatus enum to a
 * locked human label — APPROVED reads "Member", GUEST reads "Guest" — never the raw token.
 * Design tokens only.
 */
type StatusMeta = { label: string; cls: string };

const STATUS_META: Record<string, StatusMeta> = {
  APPROVED: { label: 'Member', cls: 'bg-primary-soft text-primary' },
  GUEST: { label: 'Guest', cls: 'bg-raised text-text-secondary' },
  PENDING: { label: 'Pending', cls: 'bg-warning-soft text-warning' },
  WAITLISTED: { label: 'Waitlisted', cls: 'bg-warning-soft text-warning' },
  REJECTED: { label: 'Declined', cls: 'bg-danger-soft text-danger' },
};

function humanize(token: string): string {
  const t = token.replace(/[_-]+/g, ' ').toLowerCase().trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unknown';
}

export function LifecycleBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: humanize(status), cls: 'bg-raised text-text-secondary' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
