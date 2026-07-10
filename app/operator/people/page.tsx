import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { ContactSourceSystem, type Prisma } from '@prisma/client';
import { BookUser, GitMerge } from 'lucide-react';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { AddPersonSheet } from './_components/AddPersonSheet';
import { PeopleToolbar } from './_components/PeopleToolbar';
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

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load people.
      </div>
    );
  }

  const canAdd = await isStaff(userId, workspaceId);

  // Server-side list controls (workspace-scoped, same 500-row cap). Params are
  // validated here — an unknown source or sort silently falls back to default.
  const params = await searchParams;
  const q = param(params.q).trim();
  const source = (Object.values(ContactSourceSystem) as string[]).includes(param(params.source))
    ? (param(params.source) as ContactSourceSystem)
    : '';
  const verified = ['verified', 'unverified'].includes(param(params.verified))
    ? param(params.verified)
    : '';
  const membership = ['member', 'none'].includes(param(params.membership))
    ? param(params.membership)
    : '';
  // Person-primary consent only (memberId: null) — matches what the Person
  // detail page's own Consent panel shows, so a filtered result is never
  // inconsistent with what an operator sees after clicking in.
  const consent = ['subscribed', 'none'].includes(param(params.consent))
    ? param(params.consent)
    : '';
  const sort = param(params.sort) === 'name' ? 'name' : '';
  const filtersActive = Boolean(q || source || verified || membership || consent);

  const where: Prisma.PersonWhereInput = { workspaceId, mergedIntoId: null };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (source) where.contactSources = { some: { source } };
  if (verified === 'verified') where.emailVerified = true;
  if (verified === 'unverified') {
    where.emailVerified = false;
    where.email = { not: null };
  }
  if (membership === 'member') where.members = { some: { mergedIntoId: null } };
  if (membership === 'none') where.members = { none: { mergedIntoId: null } };
  if (consent === 'subscribed') {
    where.channelSubscriptions = { some: { memberId: null, status: 'SUBSCRIBED' } };
  }
  if (consent === 'none') where.channelSubscriptions = { none: { memberId: null } };

  const people = await db.person.findMany({
    where,
    orderBy:
      sort === 'name'
        ? [{ firstName: { sort: 'asc', nulls: 'last' } }, { lastName: { sort: 'asc', nulls: 'last' } }]
        : { createdAt: 'desc' },
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
          action={
            <>
              <Link
                href="/operator/people/merge"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                <GitMerge className="h-4 w-4" />
                Merge queue
              </Link>
              {canAdd ? <AddPersonSheet /> : null}
            </>
          }
        />
        <PeopleToolbar
          filters={{ q, source, verified, membership, consent, sort }}
          sourceOptions={Object.entries(CONTACT_SOURCE_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
        {people.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={BookUser}
              title="No people match"
              subtitle="Try a different search or clear the filters."
            />
          ) : (
            <EmptyState
              icon={BookUser}
              title="No people yet"
              subtitle="People appear here from their first touch — an application started, an account created, or an operator adding them."
            />
          )
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
