import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { resolveSegmentPopulation, type SegmentFilterDefinition } from '@/lib/segments/evaluate';
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
import { CONTACT_ROLE_LABELS, CONTACT_SOURCE_LABELS } from '@/lib/crm/labels';
import { MEMBER_STATUS_LABELS, formatCrmDate } from '../../people/person-display';
import { Users } from 'lucide-react';

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

/** Human-readable rendering of the filter AST — never show raw JSON to an
 *  operator. */
function describeDefinition(definition: SegmentFilterDefinition): string[] {
  const lines: string[] = [];
  if (definition.q) lines.push(`Name or email contains "${definition.q}"`);
  if (definition.source) lines.push(`Source: ${CONTACT_SOURCE_LABELS[definition.source]}`);
  if (definition.verified === 'verified') lines.push('Email verified');
  if (definition.verified === 'unverified') lines.push('Email unverified');
  if (definition.membership === 'member') lines.push('Has a membership');
  if (definition.membership === 'none') lines.push('CRM only — no membership');
  if (definition.membershipStatus) lines.push(`Membership status: ${MEMBER_STATUS_LABELS[definition.membershipStatus]}`);
  if (definition.consent === 'subscribed') lines.push('Subscribed (consent on file)');
  if (definition.consent === 'none') lines.push('No consent on file');
  if (definition.role) lines.push(`Role: ${CONTACT_ROLE_LABELS[definition.role]}`);
  if (definition.organizationId) lines.push('Affiliated with a specific organization');
  if (definition.tagId) lines.push('Has a specific tag');
  if (definition.firmographic) lines.push(`${definition.firmographic.field}: ${definition.firmographic.value}`);
  if (definition.customField) lines.push(`Custom field "${definition.customField.stableKey}" = "${definition.customField.value}"`);
  if (definition.eventId) lines.push('Attended a specific event');
  if (definition.createdAfter) lines.push(`Added after ${definition.createdAfter}`);
  if (definition.createdBefore) lines.push(`Added before ${definition.createdBefore}`);
  return lines.length ? lines : ['No filters — everyone in the workspace'];
}

export default async function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) notFound();

  const segment = await db.segment.findFirst({ where: { id, workspaceId } });
  if (!segment) notFound();

  const definition = segment.definition as SegmentFilterDefinition;
  const identities = await resolveSegmentPopulation(db, segment);

  const personIds = identities.map((i) => i.personId).filter((x): x is string => Boolean(x));
  const memberIds = identities.map((i) => i.memberId).filter((x): x is string => Boolean(x));
  const [persons, members] = await Promise.all([
    personIds.length
      ? db.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    memberIds.length
      ? db.member.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, firstName: true, lastName: true, email: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const personById = new Map(persons.map((p) => [p.id, p]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const rows = identities.map((identity) => {
    const person = identity.personId ? personById.get(identity.personId) : null;
    const member = identity.memberId ? memberById.get(identity.memberId) : null;
    const display = person ?? member;
    const name = display ? [display.firstName, display.lastName].filter(Boolean).join(' ') : '';
    return {
      key: `${identity.personId ?? ''}:${identity.memberId ?? ''}`,
      name: name || display?.email || 'Unnamed',
      email: display?.email ?? null,
      status: member ? MEMBER_STATUS_LABELS[member.status] : null,
      lead: !member,
    };
  });

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full max-w-4xl">
        <PageHeader
          title={segment.name}
          subtitle={segment.description ?? undefined}
          crumbs={[{ label: 'Segments', href: '/operator/segments' }]}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge tone={segment.kind === 'STATIC' ? 'neutral' : 'blue'}>
                {segment.kind === 'STATIC' ? 'Static snapshot' : 'Dynamic — always current'}
              </StatusBadge>
              <Link
                href={`/operator/segments/${segment.id}/edit`}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                Edit
              </Link>
            </div>
          }
        />

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <SectionCard title="Definition">
            <ul className="space-y-1 text-[13px] text-text-primary">
              {describeDefinition(definition).map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Resolved population">
            <p className="text-2xl font-semibold text-text-primary">{identities.length}</p>
            <p className="mt-1 text-[13px] text-text-secondary">
              {segment.kind === 'STATIC'
                ? `Frozen at creation — ${formatCrmDate(segment.createdAt)}.`
                : segment.lastEvaluatedAt
                  ? `Re-evaluated live on every load. Last evaluated ${formatCrmDate(segment.lastEvaluatedAt)}.`
                  : 'Re-evaluated live on every load.'}
            </p>
          </SectionCard>
        </div>

        {definition.consent ? (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-[13px]"
            style={{ borderColor: 'var(--warning, var(--border))', color: 'var(--text-secondary)' }}
          >
            <strong className="text-text-primary">Not a reliable blast target.</strong> This
            filter reflects consent state on file (ChannelSubscription), not what the Blast
            messaging engine actually honors — Blast sends gate on a member&apos;s own opt-in
            fields (lib/blast/consent.ts), a separate mechanism. This count can be wrong for a
            promoted member until that gap closes. Don&apos;t use this segment to imply who will
            actually receive a message.
          </div>
        ) : null}

        {definition.eventId ? (
          <div
            className="mb-4 rounded-md border px-4 py-3 text-[13px]"
            style={{ borderColor: 'var(--warning, var(--border))', color: 'var(--text-secondary)' }}
          >
            <strong className="text-text-primary">Excludes leads.</strong> Event attendance can
            only be recorded against a Member today, so anyone in this workspace who hasn&apos;t
            yet become a Member is silently excluded from this filter, even if they&apos;re
            otherwise a great match.
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="Nobody matches yet" subtitle="Adjust the definition to widen this segment." />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader>Person</DataTableHeader>
              <DataTableHeader>Email</DataTableHeader>
              <DataTableHeader>Status</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {rows.map((row) => (
                <DataTableRow key={row.key}>
                  <DataTableCell>
                    <span className={row.lead ? 'italic text-text-secondary' : 'font-medium'}>
                      {row.name}
                    </span>
                  </DataTableCell>
                  <DataTableCell tone="secondary">{row.email ?? '—'}</DataTableCell>
                  <DataTableCell tone="secondary">
                    {row.status ?? <span className="italic text-text-tertiary">Lead — no membership</span>}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        )}

        <p className="mt-6 text-xs text-text-tertiary">
          <Link href="/operator/segments" className="underline">
            Back to segments
          </Link>
        </p>
      </div>
    </div>
  );
}
