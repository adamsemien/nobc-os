import Link from 'next/link';
import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { db } from '@/lib/db';
import {
  DataTableShell,
  DataTableHead,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/ui';
import { PageHeader } from '../../_components/PageHeader';
import { Avatar } from '../../_components/Avatar';

// Influence Model — Layer 1 connector ranking (see _context/16-member-intelligence/INFLUENCE-MODEL.md).
// Ranks referrers by the members they brought in, weighted by how many were approved. Reads the
// existing referredBy spine; no schema, no new table. Internal operator view, never sponsor-facing.

export default async function ConnectorsPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);

  // Everyone who has a referrer. Group by referrer in memory (workspace scale is small).
  const referred = await db.member.findMany({
    where: { workspaceId, referredByMemberId: { not: null }, mergedIntoId: null },
    select: { referredByMemberId: true, approved: true },
  });

  const agg = new Map<string, { total: number; members: number }>();
  for (const r of referred) {
    const key = r.referredByMemberId as string;
    const entry = agg.get(key) ?? { total: 0, members: 0 };
    entry.total += 1;
    if (r.approved) entry.members += 1; // "became a member" = approved
    agg.set(key, entry);
  }

  const ids = [...agg.keys()];
  const referrers = ids.length
    ? await db.member.findMany({
        where: { id: { in: ids }, workspaceId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const byId = new Map(referrers.map((m) => [m.id, m]));

  const rows = ids
    .map((id) => {
      const m = byId.get(id);
      const a = agg.get(id);
      if (!m || !a) return null;
      return {
        id,
        fullName: `${m.firstName} ${m.lastName}`.trim() || m.email,
        email: m.email,
        total: a.total,
        members: a.members,
      };
    })
    .filter((r): r is { id: string; fullName: string; email: string; total: number; members: number } => r !== null)
    // Rank by converted members first, then raw referral volume.
    .sort((a, b) => b.members - a.members || b.total - a.total);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <PageHeader
        crumbs={[{ href: '/operator/members', label: 'Members' }, { label: 'Connectors' }]}
        title="Connectors"
        subtitle="Who built the room, ranked by members they referred who were approved."
      />

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-text-muted">
          No referrals recorded yet. Set a referrer on a member record to start the graph.
        </p>
      ) : (
        <div className="mt-6">
          <DataTableShell>
            <DataTableHead>
              <DataTableHeader className="w-8" />
              <DataTableHeader>Connector</DataTableHeader>
              <DataTableHeader align="right">Became members</DataTableHeader>
              <DataTableHeader align="right">Referred total</DataTableHeader>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r, i) => (
                <DataTableRow key={r.id}>
                  <DataTableCell tone="tertiary">{i + 1}</DataTableCell>
                  <DataTableCell>
                    <Link href={`/operator/members/${r.id}`} className="flex items-center gap-3">
                      <Avatar name={r.fullName} email={r.email} size={32} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-primary">{r.fullName}</div>
                        <div className="truncate text-xs text-text-muted">{r.email}</div>
                      </div>
                    </Link>
                  </DataTableCell>
                  <DataTableCell align="right">{r.members}</DataTableCell>
                  <DataTableCell align="right">{r.total}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        </div>
      )}
    </div>
  );
}
