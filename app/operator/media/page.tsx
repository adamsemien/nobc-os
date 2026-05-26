import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { MediaWorkspace } from './_components/MediaWorkspace';

export default async function MediaPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.READ_ONLY);

  const [events, sponsorRows] = await Promise.all([
    db.event.findMany({
      where: { workspaceId },
      select: { id: true, title: true },
      orderBy: { startAt: 'desc' },
      take: 200,
    }),
    db.asset.findMany({
      where: { workspaceId, deletedAt: null, sponsorName: { not: null } },
      select: { sponsorName: true },
      distinct: ['sponsorName'],
      take: 200,
    }),
  ]);
  const sponsors = sponsorRows
    .map((s) => s.sponsorName)
    .filter((s): s is string => Boolean(s));

  return (
    <div className="font-[family-name:var(--font-dm-sans)]">
      <PageHeader title="Media" />
      <MediaWorkspace options={{ events, sponsors }} />
    </div>
  );
}
