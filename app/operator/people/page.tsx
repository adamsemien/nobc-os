import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { BookUser } from 'lucide-react';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import {
  Avatar,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableShell,
  EmptyState,
  PageHeader,
  StatusBadge,
  memberTone,
} from '@/components/ui';
import { CONTACT_SOURCE_LABELS } from '@/lib/crm/labels';
import { MEMBER_STATUS_LABELS, personDisplay, formatCrmDate } from './person-display';

export default async function PeoplePage() {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load people.
      </div>
    );
  }

  const people = await db.person.findMany({
    where: { workspaceId, mergedIntoId: null },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      contactSources: { select: { source: true } },
      members: {
        where: { mergedIntoId: null },
        select: { id: true, status: true },
      },
    },
  });

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title="People"
          subtitle={`Every human the platform has touched — ${people.length} ${people.length === 1 ? 'person' : 'people'}.`}
        />
        {people.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title="No people yet"
            subtitle="People appear here from their first touch — an application started, an account created, or an operator adding them."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>Person</DataTableHeader>
              <DataTableHeader>Email</DataTableHeader>
              <DataTableHeader>Sources</DataTableHeader>
              <DataTableHeader>Membership</DataTableHeader>
              <DataTableHeader align="right">Added</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {people.map((person) => {
                const display = personDisplay(person);
                const membership = person.members[0] ?? null;
                return (
                  <DataTableRow key={person.id}>
                    <DataTableCell>
                      <Link
                        href={`/operator/people/${person.id}`}
                        className="flex items-center gap-2.5 font-medium hover:underline"
                      >
                        <Avatar name={display.label} email={person.email} size={28} />
                        <span
                          className={display.placeholder ? 'font-normal italic' : undefined}
                          style={
                            display.placeholder
                              ? { color: 'var(--text-tertiary, var(--text-muted))' }
                              : undefined
                          }
                        >
                          {display.label}
                        </span>
                        {person.potentialDuplicateOfId ? (
                          <StatusBadge tone="warning" title="Flagged for the merge queue">
                            Possible duplicate
                          </StatusBadge>
                        ) : null}
                      </Link>
                    </DataTableCell>
                    <DataTableCell tone="secondary">
                      {person.email ? (
                        <span className="inline-flex items-center gap-2">
                          {person.email}
                          {person.emailVerified ? (
                            <StatusBadge tone="success" title="Proven by an identity provider">
                              Verified
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral" title="Typed, not identity-proven">
                              Unverified
                            </StatusBadge>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </DataTableCell>
                    <DataTableCell tone="secondary">
                      {person.contactSources.length > 0
                        ? person.contactSources
                            .map((cs) => CONTACT_SOURCE_LABELS[cs.source])
                            .join(', ')
                        : '—'}
                    </DataTableCell>
                    <DataTableCell>
                      {membership ? (
                        <StatusBadge tone={memberTone(membership.status)}>
                          {MEMBER_STATUS_LABELS[membership.status]}
                        </StatusBadge>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell align="right" tone="tertiary">
                      {formatCrmDate(person.createdAt)}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTableShell>
        )}
      </div>
    </div>
  );
}
