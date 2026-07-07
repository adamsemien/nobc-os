import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRolePage } from '@/lib/operator-role';
import { PageHeader } from '@/components/ui';
import { CONTACT_SOURCE_LABELS } from '@/lib/crm/labels';
import { findDuplicatePairs, pickSurvivorDefault } from '@/lib/crm/person-merge';
import { MEMBER_STATUS_LABELS, personDisplay, formatCrmDate } from '../person-display';
import { MergeQueueView, type PairView, type PersonView } from './_components/MergeQueueView';

/** Merge queue (Phase 2B Campaign 1). STAFF can review and dismiss; executing
 *  a merge is ADMIN-gated server-side (the button reflects it). */
export default async function MergeQueuePage() {
  const { workspaceId, role } = await requireRolePage(OperatorRole.STAFF);
  const canMerge = role === OperatorRole.ADMIN || role === OperatorRole.OWNER;

  const pairIds = await findDuplicatePairs(workspaceId);
  const ids = Array.from(new Set(pairIds.flatMap((p) => [p.aId, p.bId])));
  const persons = ids.length
    ? await db.person.findMany({
        where: { id: { in: ids }, workspaceId },
        include: {
          contactSources: { select: { source: true } },
          members: { where: { mergedIntoId: null }, select: { id: true, status: true } },
          _count: { select: { engagementEvents: true, applications: true } },
        },
      })
    : [];
  const byId = new Map(persons.map((p) => [p.id, p]));

  const pairs: PairView[] = [];
  for (const pair of pairIds) {
    const a = byId.get(pair.aId);
    const b = byId.get(pair.bId);
    if (!a || !b) continue;

    const view = (p: typeof a): PersonView => {
      const display = personDisplay(p);
      return {
        id: p.id,
        label: display.label,
        placeholder: display.placeholder,
        email: p.email,
        emailVerified: p.emailVerified,
        phone: p.phone,
        accountLinked: Boolean(p.clerkUserId),
        sources: p.contactSources.map((cs) => CONTACT_SOURCE_LABELS[cs.source]),
        membership: p.members[0] ? MEMBER_STATUS_LABELS[p.members[0].status] : null,
        activityCount: p._count.engagementEvents,
        applicationCount: p._count.applications,
        added: formatCrmDate(p.createdAt),
      };
    };

    const bothHaveMembers = a.members.length > 0 && b.members.length > 0;
    const twoAccounts = Boolean(
      a.clerkUserId && b.clerkUserId && a.clerkUserId !== b.clerkUserId,
    );

    pairs.push({
      matchType: pair.matchType,
      a: view(a),
      b: view(b),
      defaultSurvivorId: pickSurvivorDefault(a, b).id,
      blocked: bothHaveMembers ? 'both_have_members' : twoAccounts ? 'two_linked_accounts' : null,
    });
  }

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full">
        <PageHeader
          title="Merge queue"
          subtitle={
            pairs.length === 0
              ? 'No possible duplicates to review.'
              : `${pairs.length} possible ${pairs.length === 1 ? 'duplicate' : 'duplicates'} to review.`
          }
          crumbs={[{ href: '/operator/people', label: 'People' }, { label: 'Merge queue' }]}
        />
        <MergeQueueView pairs={pairs} canMerge={canMerge} />
      </div>
    </div>
  );
}
