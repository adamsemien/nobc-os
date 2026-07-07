import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff, isAdmin } from '@/lib/operator-role';
import { Avatar, EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { ORGANIZATION_KIND_LABELS } from '@/lib/crm/labels';
import { personDisplay, formatCrmDate } from '../../people/person-display';
import { EditOrganizationFields } from '../_components/EditOrganizationFields';
import {
  AddAffiliationForm,
  RemoveAffiliationButton,
} from '../_components/AffiliationControls';

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) notFound();

  const organization = await db.organization.findFirst({
    where: { id, workspaceId },
    include: {
      people: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!organization) notFound();

  const [canEdit, canDelete] = await Promise.all([
    isStaff(userId, workspaceId),
    isAdmin(userId, workspaceId),
  ]);

  // Picker options for a new affiliation: unmerged workspace persons not
  // already affiliated (the API still 409s duplicates as the backstop).
  const affiliatedIds = new Set(organization.people.map((a) => a.person.id));
  const personOptions = canEdit
    ? (
        await db.person.findMany({
          where: { workspaceId, mergedIntoId: null },
          orderBy: { createdAt: 'desc' },
          take: 500,
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      )
        .filter((p) => !affiliatedIds.has(p.id))
        .map((p) => ({ id: p.id, label: personDisplay(p).label }))
    : [];

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title={organization.name}
          subtitle={
            <span className="inline-flex items-center gap-2">
              <StatusBadge tone="neutral">
                {ORGANIZATION_KIND_LABELS[organization.kind]}
              </StatusBadge>
              {organization.domain ? <span>{organization.domain}</span> : null}
              <span>· added {formatCrmDate(organization.createdAt)}</span>
            </span>
          }
          crumbs={[
            { href: '/operator/organizations', label: 'Organizations' },
            { label: organization.name },
          ]}
        />

        <EditOrganizationFields
          organizationId={organization.id}
          name={organization.name}
          kind={organization.kind}
          domain={organization.domain}
          website={organization.website}
          notes={organization.notes}
          canEdit={canEdit}
          canDelete={canDelete}
        />

        {organization.website || organization.notes ? (
          <section className="mb-4 rounded-md border border-border bg-surface p-4">
            {organization.website ? (
              <p className="text-[13px]">
                <span className="text-text-secondary">Website: </span>
                <a
                  href={organization.website}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-text-primary underline"
                >
                  {organization.website}
                </a>
              </p>
            ) : null}
            {organization.notes ? (
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-text-secondary">
                {organization.notes}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            People
          </h2>
          {organization.people.length === 0 ? (
            <EmptyState
              compact
              title="No people affiliated yet"
              subtitle="Affiliations connect People to this account."
            />
          ) : (
            <ul className="space-y-2.5">
              {organization.people.map((affiliation) => {
                const display = personDisplay(affiliation.person);
                return (
                  <li key={affiliation.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/operator/people/${affiliation.person.id}`}
                      className="flex min-w-0 items-center gap-2.5 text-[13px] font-medium text-text-primary hover:underline"
                    >
                      <Avatar name={display.label} email={affiliation.person.email} size={26} />
                      <span
                        className={`truncate ${display.placeholder ? 'font-normal italic' : ''}`}
                        style={
                          display.placeholder
                            ? { color: 'var(--text-tertiary, var(--text-muted))' }
                            : undefined
                        }
                      >
                        {display.label}
                      </span>
                    </Link>
                    <span className="flex shrink-0 items-center gap-2 text-[13px] text-text-secondary">
                      {affiliation.role ?? (affiliation.isPrimary ? 'Primary contact' : '—')}
                      {canEdit ? <RemoveAffiliationButton affiliationId={affiliation.id} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit ? (
            <AddAffiliationForm
              organizationId={organization.id}
              options={personOptions}
              pickLabel="Pick a person…"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
