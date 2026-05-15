import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import Link from 'next/link';

const PAGE_SIZE = 50;

function formatAction(action: string): string {
  return action.replace(/\./g, ' › ').replace(/_/g, ' ');
}

function actionColor(action: string): string {
  if (action.startsWith('application.approved')) return '#16a34a';
  if (action.startsWith('application.rejected')) return '#dc2626';
  if (action.startsWith('rsvp.refunded')) return '#d97706';
  if (action.startsWith('rsvp.checked_in')) return '#2563eb';
  return '#6b7280';
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
    <div className="px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-3xl font-normal text-text-primary"
            style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
          >
            Audit Log
          </h1>
          <span className="text-sm text-text-muted">{total.toLocaleString()} events</span>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map(e => (
                <tr key={e.id} className="bg-surface-elevated hover:bg-muted transition-colors">
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: actionColor(e.action) }}>
                    {formatAction(e.action)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.entityType}</span>
                    {' '}
                    <span className="font-mono text-xs text-text-muted">{e.entityId.slice(-8)}</span>
                  </td>
                  <td className="px-4 py-3 text-text-muted font-mono text-xs">
                    {e.actorId ? e.actorId.slice(-12) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm text-text-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-3">
              {page > 1 && (
                <Link href={`/operator/audit?page=${page - 1}`} className="text-primary hover:underline">
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/operator/audit?page=${page + 1}`} className="text-primary hover:underline">
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
