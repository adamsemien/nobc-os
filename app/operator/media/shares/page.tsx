/**
 * Operator-side ShareLink management — list + copy + delete. STAFF-gated.
 *
 * Server component fetches all ShareLinks for the workspace (newest first),
 * then a thin client component handles per-row clipboard + delete with
 * optimistic removal.
 */
import { OperatorRole, ShareLinkMode } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { shareAbsoluteUrl } from '@/lib/share/token';
import { SharesList, type ShareRow } from './_components/SharesList';

export default async function SharesPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.STAFF);

  const links = await db.shareLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      mode: true,
      watermark: true,
      allowedDownloads: true,
      expiresAt: true,
      lastAccessedAt: true,
      accessCount: true,
      createdAt: true,
      password: true,
      folder: { select: { name: true, deletedAt: true } },
      _count: { select: { downloads: true } },
    },
  });

  const rows: ShareRow[] = links.map((l: typeof links[number]) => ({
    id: l.id,
    token: l.token,
    mode: l.mode === ShareLinkMode.SPONSOR ? 'sponsor' : 'gallery',
    url: shareAbsoluteUrl(l.mode, l.token),
    folderName: l.folder.name,
    folderDeleted: l.folder.deletedAt != null,
    passwordProtected: l.password != null,
    watermark: l.watermark,
    allowedDownloads: l.allowedDownloads,
    downloadsUsed: l._count.downloads,
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    lastAccessedAt: l.lastAccessedAt ? l.lastAccessedAt.toISOString() : null,
    accessCount: l.accessCount,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-full flex-col font-[family-name:var(--font-dm-sans)]">
      <div className="shrink-0 px-6 pt-8 lg:px-10">
        <PageHeader title="Shares" subtitle="Public delivery + member-gallery links for this workspace." />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
        <SharesList initial={rows} />
      </div>
    </div>
  );
}
