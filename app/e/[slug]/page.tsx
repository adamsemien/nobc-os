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

  return (
    <PublicEventShell>
      <EventDetail event={dto} />
    </PublicEventShell>
  );
}
