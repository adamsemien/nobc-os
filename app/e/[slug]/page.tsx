import { notFound } from 'next/navigation';
import { assemblePublicEventDTO } from '@/lib/public-event-loader';
import { EventDetail } from '@/app/m/events/[slug]/_components/EventDetail';
import { PublicEventShell } from './_components/PublicEventShell';

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dto = await assemblePublicEventDTO(slug);
  if (!dto) notFound();

  // Every event — including the active one — renders the full event page. The
  // active event's two-choice fork lives in the access-card slot inside the
  // template (see TemplateSplit), not as a whole-page replacement.
  return (
    <PublicEventShell>
      <EventDetail event={dto} />
    </PublicEventShell>
  );
}
