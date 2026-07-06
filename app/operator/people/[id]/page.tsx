import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { Avatar, EmptyState, PageHeader, StatusBadge, memberTone } from '@/components/ui';
import { engagementMeta } from '@/lib/engagement-labels';
import {
  CONTACT_ROLE_LABELS,
  CONTACT_SOURCE_LABELS,
  ORGANIZATION_KIND_LABELS,
} from '@/lib/crm/labels';
import { MEMBER_STATUS_LABELS, personDisplayName, formatCrmDate } from '../person-display';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[13px] text-text-secondary">{label}</span>
      <span className="min-w-0 text-right text-[13px] text-text-primary">{children}</span>
    </div>
  );
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) notFound();

  const person = await db.person.findFirst({
    where: { id, workspaceId },
    include: {
      contactSources: { orderBy: { firstSeenAt: 'asc' } },
      members: { where: { mergedIntoId: null }, select: { id: true, status: true, email: true } },
      potentialDuplicateOf: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      mergedInto: { select: { id: true } },
      organizations: {
        include: { organization: { select: { id: true, name: true, kind: true } } },
      },
    },
  });
  if (!person) notFound();

  const memberIds = person.members.map((m) => m.id);
  const activity = await db.memberEngagementEvent.findMany({
    where: {
      workspaceId,
      OR: [{ personId: person.id }, ...(memberIds.length ? [{ memberId: { in: memberIds } }] : [])],
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { id: true, eventType: true, occurredAt: true },
  });

  const name = personDisplayName(person);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Avatar name={name} email={person.email} size={36} />
              {name}
            </span>
          }
          subtitle={`In the CRM since ${formatCrmDate(person.createdAt)}.`}
          crumbs={[{ href: '/operator/people', label: 'People' }, { label: name }]}
        />

        {person.mergedInto ? (
          <div
            className="mb-4 rounded-md border border-border px-4 py-3 text-[13px]"
            style={{ background: 'var(--muted)', color: 'var(--text-secondary)' }}
          >
            This record was merged into{' '}
            <Link
              href={`/operator/people/${person.mergedInto.id}`}
              className="font-medium underline"
            >
              its canonical person
            </Link>
            .
          </div>
        ) : null}

        {person.potentialDuplicateOf ? (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-[13px]"
            style={{
              background: 'var(--warning-soft)',
              borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
              color: 'var(--text-primary)',
            }}
          >
            Possible duplicate of{' '}
            <Link
              href={`/operator/people/${person.potentialDuplicateOf.id}`}
              className="font-medium underline"
            >
              {personDisplayName(person.potentialDuplicateOf)}
            </Link>{' '}
            — this record was created from an unverified email that matches theirs. Merge review
            arrives with the merge queue.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Identity">
            <Field label="Email">
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
            </Field>
            <Field label="Phone">{person.phone ?? '—'}</Field>
            <Field label="Account">
              {person.clerkUserId ? (
                <StatusBadge tone="success">Signed-up account linked</StatusBadge>
              ) : (
                <span style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>No account</span>
              )}
            </Field>
            {person.roles.length > 0 ? (
              <Field label="Roles">
                {person.roles.map((role) => CONTACT_ROLE_LABELS[role]).join(', ')}
              </Field>
            ) : null}
          </SectionCard>

          <SectionCard title="Membership">
            {person.members.length === 0 ? (
              <p className="py-1.5 text-[13px] text-text-secondary">
                No membership profile — this person exists in the CRM only.
              </p>
            ) : (
              <ul className="space-y-2">
                {person.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/operator/members/${member.id}`}
                      className="text-[13px] font-medium text-text-primary hover:underline"
                    >
                      {member.email}
                    </Link>
                    <StatusBadge tone={memberTone(member.status)}>
                      {MEMBER_STATUS_LABELS[member.status]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Sources">
            {person.contactSources.length === 0 ? (
              <p className="py-1.5 text-[13px] text-text-secondary">No provenance recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {person.contactSources.map((cs) => (
                  <li key={cs.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-text-primary">{CONTACT_SOURCE_LABELS[cs.source]}</span>
                    <span style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>
                      first seen {formatCrmDate(cs.firstSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Organizations">
            {person.organizations.length === 0 ? (
              <p className="py-1.5 text-[13px] text-text-secondary">No affiliations.</p>
            ) : (
              <ul className="space-y-2">
                {person.organizations.map((affiliation) => (
                  <li
                    key={affiliation.id}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <Link
                      href={`/operator/organizations/${affiliation.organization.id}`}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {affiliation.organization.name}
                    </Link>
                    <span className="text-text-secondary">
                      {affiliation.role ??
                        ORGANIZATION_KIND_LABELS[affiliation.organization.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="mt-4">
          <SectionCard title="Activity">
            {activity.length === 0 ? (
              <EmptyState compact title="No activity yet" />
            ) : (
              <ol className="space-y-2.5">
                {activity.map((event) => {
                  const meta = engagementMeta(event.eventType);
                  return (
                    <li key={event.id} className="flex items-baseline justify-between gap-4">
                      <span className="text-[13px] text-text-primary">{meta.label}</span>
                      <span
                        className="shrink-0 text-[12px]"
                        style={{ color: 'var(--text-tertiary, var(--text-muted))' }}
                      >
                        {formatCrmDate(event.occurredAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
