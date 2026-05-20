import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import Link from 'next/link';
import {
  PageHeader,
  DataTableShell,
  DataTableHead,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  EmptyState,
} from '@/components/ui';
import { Activity } from 'lucide-react';

const PAGE_SIZE = 50;

function formatAction(action: string): string {
  return action.replace(/\./g, ' › ').replace(/_/g, ' ');
}

function actionColor(action: string): string {
  if (action.startsWith('application.approved')) return 'var(--success)';
  if (action.startsWith('application.rejected')) return 'var(--danger)';
  if (action.startsWith('rsvp.refunded')) return 'var(--warning)';
  if (action.startsWith('rsvp.checked_in')) return 'var(--text-primary)';
  if (action.startsWith('rsvp.comp_issued')) return 'var(--accent)';
  return 'var(--text-secondary)';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const workspaceId = await requireWorkspaceId(userId);
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr ?? 1));
  const skip = (page - 1) * PAGE_SIZE;

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    db.auditEvent.count({ where: { workspaceId } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1280px]">
        <PageHeader
          title="Activity"
          subtitle="Everything that happened — operator decisions, member RSVPs, agent actions."
          action={
            <span className="text-sm text-text-muted tabular-nums">
              {total.toLocaleString()} events
            </span>
          }
        />

        {events.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            subtitle="Operator and agent actions will appear here as they happen."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>Time</DataTableHeader>
              <DataTableHeader>Action</DataTableHeader>
              <DataTableHeader>Entity</DataTableHeader>
              <DataTableHeader>Actor</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {events.map((e) => (
                <DataTableRow key={e.id}>
                  <DataTableCell tone="tertiary" className="whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </DataTableCell>
                  <DataTableCell className="font-medium">
                    <span style={{ color: actionColor(e.action) }}>
                      {formatAction(e.action)}
                    </span>
                  </DataTableCell>
                  <DataTableCell tone="secondary">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {e.entityType}
                    </span>{' '}
                    <span className="font-mono text-xs text-text-muted">
                      {e.entityId.slice(-8)}
                    </span>
                  </DataTableCell>
                  <DataTableCell tone="tertiary" className="font-mono text-xs">
                    {e.actorId ? e.actorId.slice(-12) : '—'}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm text-text-muted">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-3">
              {page > 1 && (
                <Link
                  href={`/operator/audit?page=${page - 1}`}
                  className="text-primary hover:underline"
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/operator/audit?page=${page + 1}`}
                  className="text-primary hover:underline"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
