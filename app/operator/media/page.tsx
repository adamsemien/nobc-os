import Link from 'next/link';
import { Share2 } from 'lucide-react';
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
    <div className="flex h-screen flex-col font-[family-name:var(--font-dm-sans)]">
      <div className="shrink-0 px-6 pt-8 lg:px-10">
        <PageHeader
          title="Media"
          action={
            <Link
              href="/operator/media/shares"
              className="flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <Share2 className="h-4 w-4" />
              Shares
            </Link>
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        <MediaWorkspace options={{ events, sponsors }} />
      </div>
    </div>
  );
}
