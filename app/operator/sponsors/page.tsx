import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { SponsorsView, type SponsorRow } from './_components/SponsorsView';

export default async function SponsorsPage() {
  const { workspaceId } = await requireRolePage(OperatorRole.STAFF);

  const sponsors = await db.sponsorBrandProfile.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, contactEmail: true, rightsFeeCents: true, createdAt: true },
  });

  const rows: SponsorRow[] = sponsors.map((s) => ({
    id: s.id,
    name: s.name,
    contactEmail: s.contactEmail,
    rightsFeeCents: s.rightsFeeCents,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="px-6 py-6 sm:px-10 lg:px-14 xl:px-20">
      <SponsorsView initialSponsors={rows} />
    </div>
  );
}
