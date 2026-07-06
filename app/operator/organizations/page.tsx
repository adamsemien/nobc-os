import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
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
import { ORGANIZATION_KIND_LABELS } from '@/lib/crm/labels';
import { formatCrmDate } from '../people/person-display';
import { NewOrganizationForm } from './_components/NewOrganizationForm';

export default async function OrganizationsPage() {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load organizations.
      </div>
    );
  }
  const canCreate = await isStaff(userId, workspaceId);

  const organizations = await db.organization.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { people: true } } },
  });

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title="Organizations"
          subtitle="Accounts — sponsor companies, SaaS prospects, and members' companies."
          action={canCreate ? <NewOrganizationForm /> : undefined}
        />
        {organizations.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No organizations yet"
            subtitle="Create the first account to start tracking sponsor and SaaS relationships."
            action={canCreate ? <NewOrganizationForm /> : undefined}
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>Organization</DataTableHeader>
              <DataTableHeader>Type</DataTableHeader>
              <DataTableHeader>Domain</DataTableHeader>
              <DataTableHeader align="right">People</DataTableHeader>
              <DataTableHeader align="right">Added</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {organizations.map((org) => (
                <DataTableRow key={org.id}>
                  <DataTableCell>
                    <Link
                      href={`/operator/organizations/${org.id}`}
                      className="font-medium hover:underline"
                    >
                      {org.name}
                    </Link>
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge tone="neutral">
                      {ORGANIZATION_KIND_LABELS[org.kind]}
                    </StatusBadge>
                  </DataTableCell>
                  <DataTableCell tone="secondary">{org.domain ?? '—'}</DataTableCell>
                  <DataTableCell align="right" tone="secondary">
                    {org._count.people}
                  </DataTableCell>
                  <DataTableCell align="right" tone="tertiary">
                    {formatCrmDate(org.createdAt)}
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
