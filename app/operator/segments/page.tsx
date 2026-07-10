import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Layers } from 'lucide-react';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableShell,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@/components/ui';
import { formatCrmDate } from '../people/person-display';

export default async function SegmentsPage() {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load segments.
      </div>
    );
  }

  const segments = await db.segment.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title="Segments"
          subtitle="Named, reusable audiences — the exact 40 you pulled that day, or everyone in Austin, always current."
          action={
            <Link
              href="/operator/segments/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              New segment
            </Link>
          }
        />
        {segments.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No segments yet"
            subtitle="Build one from the People filter bar, or start from scratch here."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>Name</DataTableHeader>
              <DataTableHeader>Kind</DataTableHeader>
              <DataTableHeader align="right">Count</DataTableHeader>
              <DataTableHeader align="right">Created</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {segments.map((segment) => (
                <DataTableRow key={segment.id}>
                  <DataTableCell>
                    <Link
                      href={`/operator/segments/${segment.id}`}
                      className="font-medium hover:underline"
                    >
                      {segment.name}
                    </Link>
                    {segment.description ? (
                      <p className="mt-0.5 text-xs text-text-tertiary">{segment.description}</p>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell tone="secondary">
                    <StatusBadge tone={segment.kind === 'STATIC' ? 'neutral' : 'blue'}>
                      {segment.kind === 'STATIC' ? 'Static snapshot' : 'Dynamic — always current'}
                    </StatusBadge>
                  </DataTableCell>
                  <DataTableCell align="right" tone="secondary">
                    {segment.cachedCount ?? '—'}
                  </DataTableCell>
                  <DataTableCell align="right" tone="tertiary">
                    {formatCrmDate(segment.createdAt)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        )}
      </div>
    </div>
  );
}
