import { notFound } from 'next/navigation';
import { assemblePublicEventDTO } from '@/lib/public-event-loader';
import { EventDetail } from '@/app/m/events/[slug]/_components/EventDetail';
import { PublicEventShell } from './_components/PublicEventShell';
import { DoorFork } from './_components/DoorFork';
import { ACTIVE_EVENT_ID } from '@/lib/active-event';

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dto = await assemblePublicEventDTO(slug);
  if (!dto) notFound();

  // The active event gets the two-choice fork (Become a member vs buy a ticket)
  // in front of the existing buy flow. Every other event renders unchanged.
  return (
    <PublicEventShell>
      {dto.eventId === ACTIVE_EVENT_ID ? (
        <DoorFork>
          <EventDetail event={dto} />
        </DoorFork>
      ) : (
        <EventDetail event={dto} />
      )}
    </PublicEventShell>
  );
}
