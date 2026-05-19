import Link from 'next/link';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../_components/PageHeader';
import { Avatar } from '../_components/Avatar';
import { ScoreBadge } from '../_components/ScoreBadge';

type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  archetype: string | null;
  aiScore: number | null;
  totalEventsAttended: number;
  lastAttendedDate: string | null;
  createdAt: string;
  isVip: boolean;
  isBlocked: boolean;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function MembersPage() {
  const res = await operatorServerFetch('/api/operator/members');
  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load members.
      </div>
    );
  }
  const { members } = (await res.json()) as { members: MemberRow[] };

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1280px]">
        <PageHeader
          title="Members"
          subtitle={`${members.length} approved · sorted by most recently added`}
        />

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="text-sm text-text-secondary">No members yet.</p>
            <Link
              href="/operator/applications"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Review applications →
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <Th>Member</Th>
                  <Th>Archetype</Th>
                  <Th>Score</Th>
                  <Th className="text-right">Events</Th>
                  <Th>Last seen</Th>
                  <Th>Joined</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/operator/members/${m.id}`} className="flex items-center gap-3">
                        <Avatar name={m.fullName} email={m.email} size={32} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-text-primary">
                            <span className="truncate font-medium">{m.fullName}</span>
                            {m.isVip ? (
                              <span title="Purple list" className="text-[#C7A7DE]">✦</span>
                            ) : null}
                            {m.isBlocked ? (
                              <span title="Blocked" className="rounded bg-danger-soft px-1 text-[9px] font-semibold uppercase text-danger">
                                blocked
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-text-muted">{m.email}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {m.archetype ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                          {m.archetype}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge value={m.aiScore} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                      {m.totalEventsAttended}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{fmtDate(m.lastAttendedDate)}</td>
                    <td className="px-4 py-3 text-text-muted">{fmtDate(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted ${className}`}
    >
      {children}
    </th>
  );
}
