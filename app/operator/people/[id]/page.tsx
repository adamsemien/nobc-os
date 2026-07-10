import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { TagEntityType } from '@prisma/client';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff, isAdmin } from '@/lib/operator-role';
import { channelIdentifier } from '@/lib/comms/can-send';
import { Avatar, EmptyState, PageHeader, StatusBadge, memberTone } from '@/components/ui';
import { EditPersonFields } from '../_components/EditPersonFields';
import { MarkInvitedButton } from '../_components/MarkInvitedButton';
import { PersonConsentPanel } from '../_components/PersonConsentPanel';
import { PersonFields } from '../_components/PersonFields';
import { PersonTags } from '../_components/PersonTags';
import {
  AddAffiliationForm,
  RemoveAffiliationButton,
} from '../../organizations/_components/AffiliationControls';
import { engagementMeta } from '@/lib/engagement-labels';
import {
  CONTACT_ROLE_LABELS,
  CONTACT_SOURCE_LABELS,
  ORGANIZATION_KIND_LABELS,
} from '@/lib/crm/labels';
import { MEMBER_STATUS_LABELS, personDisplay, formatCrmDate } from '../person-display';

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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <span className="text-sm text-text-primary">{value}</span>
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

  const [canEdit, canDelete] = await Promise.all([
    isStaff(userId, workspaceId),
    isAdmin(userId, workspaceId),
  ]);

  // Picker options for a new affiliation: workspace organizations not already
  // affiliated (the API still 409s duplicates as the backstop).
  const affiliatedOrgIds = new Set(person.organizations.map((a) => a.organization.id));
  const organizationOptions = canEdit
    ? (
        await db.organization.findMany({
          where: { workspaceId },
          orderBy: { name: 'asc' },
          take: 500,
          select: { id: true, name: true },
        })
      )
        .filter((o) => !affiliatedOrgIds.has(o.id))
        .map((o) => ({ id: o.id, label: o.name }))
    : [];

  const memberIds = person.members.map((m) => m.id);
  const activity = await db.memberEngagementEvent.findMany({
    where: {
      workspaceId,
      OR: [{ personId: person.id }, ...(memberIds.length ? [{ memberId: { in: memberIds } }] : [])],
    },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    select: { id: true, eventType: true, occurredAt: true, eventId: true },
  });

  // Slice 5: event titles for the activity feed — the same OR-query above
  // already surfaces attendance/invited rows for a bare lead (personId) and a
  // promoted Person (memberId fallback) alike; this just joins in Event.title
  // rather than leaving eventId unreadable. Counts drive the stat tiles below.
  const activityEventIds = Array.from(
    new Set(activity.map((a) => a.eventId).filter((v): v is string => Boolean(v))),
  );
  const activityEvents = activityEventIds.length
    ? await db.event.findMany({
        where: { id: { in: activityEventIds }, workspaceId },
        select: { id: true, title: true },
      })
    : [];
  const eventTitleById = new Map(activityEvents.map((e) => [e.id, e.title]));
  const invitedCount = activity.filter((a) => a.eventType === 'invited').length;
  const attendedCount = activity.filter((a) => a.eventType === 'checked_in').length;

  const inviteEventOptions = canEdit
    ? await db.event.findMany({
        where: { workspaceId },
        orderBy: { startAt: 'desc' },
        take: 100,
        select: { id: true, title: true },
      })
    : [];

  // CRM spine Slice 0: consent, custom fields, and tags for a Person with no
  // Member. FieldDefinition stays scoped to section: 'member' (shared catalog
  // — see the Slice 0 plan); ChannelSubscription is filtered to memberId: null
  // so a promoted Person's member-keyed rows never show here.
  //
  // Slice 1: suppression is looked up by identifier (email/phone), the same
  // way canSend actually decides blocking — not by personId/memberId FK,
  // which a suppression row may not carry (e.g. a carrier-level STOP or a
  // bounce recorded before any Person/Member link existed).
  const emailIdentifier = channelIdentifier(person, 'EMAIL');
  const smsIdentifier = channelIdentifier(person, 'SMS');

  const [fieldDefs, consentSubscriptions, consentSuppressions, personTags] = await Promise.all([
    db.fieldDefinition.findMany({
      where: { workspaceId, section: 'member', isActive: true },
      orderBy: { order: 'asc' },
      select: { stableKey: true, name: true, type: true, options: true },
    }),
    db.channelSubscription.findMany({
      where: { workspaceId, personId: person.id, memberId: null },
      select: { channel: true, status: true, consentBasis: true, consentSource: true },
    }),
    emailIdentifier || smsIdentifier
      ? db.suppressionEntry.findMany({
          where: {
            workspaceId,
            OR: [
              ...(emailIdentifier ? [{ channel: 'EMAIL' as const, identifier: emailIdentifier }] : []),
              ...(smsIdentifier ? [{ channel: 'SMS' as const, identifier: smsIdentifier }] : []),
            ],
          },
          select: { channel: true, reason: true },
        })
      : Promise.resolve([]),
    db.entityTag.findMany({
      where: { workspaceId, entityType: TagEntityType.person, entityId: person.id },
      include: { tag: { select: { id: true, name: true, color: true } } },
      orderBy: { appliedAt: 'desc' },
    }),
  ]);

  const display = personDisplay(person);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Avatar name={display.label} email={person.email} size={36} />
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
            </span>
          }
          subtitle={`In the CRM since ${formatCrmDate(person.createdAt)}.`}
          crumbs={[{ href: '/operator/people', label: 'People' }, { label: display.label }]}
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
              {personDisplay(person.potentialDuplicateOf).label}
            </Link>{' '}
            — this record was created from an unverified email that matches theirs.{' '}
            <Link href="/operator/people/merge" className="font-medium underline">
              Review it in the merge queue
            </Link>
            .
          </div>
        ) : null}

        {!person.mergedInto ? (
          <EditPersonFields
            personId={person.id}
            firstName={person.firstName}
            lastName={person.lastName}
            phone={person.phone}
            canEdit={canEdit}
            canDelete={canDelete}
          />
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
                    <span className="flex items-center gap-2 text-text-secondary">
                      {affiliation.role ??
                        ORGANIZATION_KIND_LABELS[affiliation.organization.kind]}
                      {canEdit && !person.mergedIntoId ? (
                        <RemoveAffiliationButton affiliationId={affiliation.id} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !person.mergedIntoId ? (
              <AddAffiliationForm
                personId={person.id}
                options={organizationOptions}
                pickLabel="Pick an organization…"
              />
            ) : null}
          </SectionCard>

          <SectionCard title="Consent">
            <PersonConsentPanel
              personId={person.id}
              subscriptions={consentSubscriptions}
              suppressions={consentSuppressions}
              canEdit={canEdit && !person.mergedIntoId}
            />
          </SectionCard>

          <SectionCard title="Fields">
            <PersonFields
              personId={person.id}
              fieldDefs={fieldDefs}
              customFields={(person.customFields as Record<string, unknown> | null) ?? {}}
              fieldProvenance={
                (person.fieldProvenance as Record<string, { source?: string } | undefined> | null) ?? {}
              }
              canEdit={canEdit && !person.mergedIntoId}
            />
          </SectionCard>

          <SectionCard title="Tags">
            <PersonTags
              personId={person.id}
              tags={personTags.map((et) => et.tag)}
              canEdit={canEdit && !person.mergedIntoId}
            />
          </SectionCard>
        </div>

        <div className="mt-4">
          <SectionCard title="Activity">
            <div className="mb-4 grid grid-cols-2 gap-4 rounded-md border border-border bg-card px-4 py-3 sm:grid-cols-4">
              <Stat label="Invited" value={invitedCount} />
              <Stat label="Attended" value={attendedCount} />
            </div>
            {canEdit && !person.mergedIntoId ? (
              <div className="mb-4">
                <MarkInvitedButton
                  personId={person.id}
                  eventOptions={inviteEventOptions.map((e) => ({ id: e.id, title: e.title }))}
                />
              </div>
            ) : null}
            {activity.length === 0 ? (
              <EmptyState compact title="No activity yet" />
            ) : (
              <ol className="space-y-2.5">
                {activity.map((event) => {
                  const meta = engagementMeta(event.eventType);
                  const eventTitle = event.eventId ? eventTitleById.get(event.eventId) : undefined;
                  return (
                    <li key={event.id} className="flex items-baseline justify-between gap-4">
                      <span className="text-[13px] text-text-primary">
                        {meta.label}
                        {eventTitle ? (
                          <span style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>
                            {' '}
                            — {eventTitle}
                          </span>
                        ) : null}
                      </span>
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
