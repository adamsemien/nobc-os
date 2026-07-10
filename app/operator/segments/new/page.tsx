import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { PageHeader } from '@/components/ui';
import { CONTACT_SOURCE_LABELS } from '@/lib/crm/labels';
import { CreateSegmentForm } from '../_components/CreateSegmentForm';

export default async function NewSegmentPage() {
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) notFound();
  if (!(await isStaff(userId, workspaceId))) notFound();

  const [tags, events] = await Promise.all([
    db.tag.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.event.findMany({
      where: { workspaceId },
      orderBy: { startAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full max-w-2xl">
        <PageHeader
          title="New segment"
          subtitle="Build a named audience from the same filters as the People list, plus a few more."
          crumbs={[{ label: 'Segments', href: '/operator/segments' }]}
        />
        <CreateSegmentForm
          sourceOptions={Object.entries(CONTACT_SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
          tagOptions={tags.map((t) => ({ value: t.id, label: t.name }))}
          eventOptions={events.map((e) => ({ value: e.id, label: e.title }))}
        />
      </div>
    </div>
  );
}
