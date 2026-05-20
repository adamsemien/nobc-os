import Link from 'next/link';
import { Users } from 'lucide-react';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import {
  PageHeader,
  Avatar,
  EmptyState,
  DataTableShell,
  DataTableHead,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/ui';
import { ScoreBadge } from '../_components/ScoreBadge';
import { MembersBulkActions } from './_components/MembersBulkActions';

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
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
          <EmptyState
            icon={Users}
            title="No members yet"
            subtitle="Members appear here after their application is approved."
            action={
              <Link
                href="/operator/applications"
                className="text-sm font-medium text-primary hover:underline"
              >
                Review applications →
              </Link>
            }
          />
        ) : (
          <MembersBulkActions
            members={members.map((m) => ({
              id: m.id,
              fullName: m.fullName,
              email: m.email,
              archetype: m.archetype,
              aiScore: m.aiScore,
              totalEventsAttended: m.totalEventsAttended,
              lastAttendedDate: m.lastAttendedDate,
              createdAt: m.createdAt,
              isVip: m.isVip,
              isBlocked: m.isBlocked,
            }))}
          >
            {(selected, toggle) => (
              <DataTableShell>
                <DataTableHead>
                  <DataTableHeader className="w-8" />
                  <DataTableHeader>Member</DataTableHeader>
                  <DataTableHeader>Archetype</DataTableHeader>
                  <DataTableHeader>Score</DataTableHeader>
                  <DataTableHeader align="right">Events</DataTableHeader>
                  <DataTableHeader>Last seen</DataTableHeader>
                  <DataTableHeader>Joined</DataTableHeader>
                </DataTableHead>
                <DataTableBody>
                  {members.map((m) => (
                    <DataTableRow key={m.id}>
                      <DataTableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggle(m.id)}
                          aria-label={`Select ${m.fullName}`}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <Link
                          href={`/operator/members/${m.id}`}
                          className="flex items-center gap-3"
                        >
                          <Avatar name={m.fullName} email={m.email} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-text-primary">
                              <span className="truncate font-medium">{m.fullName}</span>
                              {m.isVip ? (
                                <span
                                  title="Purple list"
                                  style={{ color: 'var(--accent, #C7A7DE)' }}
                                >
                                  ✦
                                </span>
                              ) : null}
                              {m.isBlocked ? (
                                <span
                                  title="Blocked"
                                  className="rounded bg-danger-soft px-1 text-[9px] font-semibold uppercase text-danger"
                                >
                                  blocked
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-xs text-text-muted">
                              {m.email}
                            </div>
                          </div>
                        </Link>
                      </DataTableCell>
                      <DataTableCell tone="secondary">
                        {m.archetype ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                            {m.archetype}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        <ScoreBadge value={m.aiScore} size="sm" />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {m.totalEventsAttended}
                      </DataTableCell>
                      <DataTableCell tone="tertiary">
                        {fmtDate(m.lastAttendedDate)}
                      </DataTableCell>
                      <DataTableCell tone="tertiary">
                        {fmtDate(m.createdAt)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTableShell>
            )}
          </MembersBulkActions>
        )}
      </div>
    </div>
  );
}
