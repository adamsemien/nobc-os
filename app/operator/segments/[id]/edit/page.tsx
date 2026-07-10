import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isStaff } from '@/lib/operator-role';
import { PageHeader } from '@/components/ui';
import { CONTACT_SOURCE_LABELS } from '@/lib/crm/labels';
import type { SegmentFilterDefinition } from '@/lib/segments/evaluate';
import { CreateSegmentForm } from '../../_components/CreateSegmentForm';
import { DeleteSegmentButton } from '../../_components/DeleteSegmentButton';

export default async function EditSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) notFound();
  if (!(await isStaff(userId, workspaceId))) notFound();

  const segment = await db.segment.findFirst({ where: { id, workspaceId } });
  if (!segment) notFound();

  const [tags, events] = await Promise.all([
    db.tag.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.event.findMany({
      where: { workspaceId },
      orderBy: { startAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);

  const definition = segment.definition as SegmentFilterDefinition;

  return (
    <div className="px-6 pb-16 pt-8 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full max-w-2xl">
        <PageHeader
          title={`Edit "${segment.name}"`}
          crumbs={[
            { label: 'Segments', href: '/operator/segments' },
            { label: segment.name, href: `/operator/segments/${segment.id}` },
          ]}
        />
        <CreateSegmentForm
          segmentId={segment.id}
          initialName={segment.name}
          initialDescription={segment.description ?? ''}
          initialKind={segment.kind}
          initialDefinition={definition}
          sourceOptions={Object.entries(CONTACT_SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
          tagOptions={tags.map((t) => ({ value: t.id, label: t.name }))}
          eventOptions={events.map((e) => ({ value: e.id, label: e.title }))}
        />
        <div className="mt-6 border-t border-border pt-6">
          <DeleteSegmentButton segmentId={segment.id} segmentName={segment.name} />
        </div>
      </div>
    </div>
  );
}
