import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getEventBySlug, getCapacityUsedRsvpCount } from '@/lib/events';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';
import {
  parseEventAccess,
  resolveViewer,
  resolveAccessForViewer,
  buildSteps,
} from '@/lib/event-access';
import {
  EventDetail,
  type EventDetailDTO,
} from '@/app/m/events/[slug]/_components/EventDetail';

/**
 * Public event page — the destination for invite links.
 *
 * Unlike /m/events/[slug], this route is NOT behind Clerk: a guest with no
 * account can open it, register, and (if the guest flow allows) pay. The
 * workspace is resolved from the event itself rather than from a Clerk org.
 * A signed-in member who opens the link still gets their member view.
 */
export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const eventRow = await db.event.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: { workspaceId: true },
  });
  if (!eventRow) notFound();
  const workspaceId = eventRow.workspaceId;

  const event = await getEventBySlug(workspaceId, slug);
  if (!event) notFound();

  // A Clerk session is optional on this route — guests have none.
  const { userId } = await auth();

  const [member, capacityUsedCount, heroImageUrl] = await Promise.all([
    userId
      ? db.member.findFirst({
          where: { workspaceId, clerkUserId: userId },
          select: { id: true, approved: true, status: true, memberQrCode: true },
        })
      : Promise.resolve(null),
    getCapacityUsedRsvpCount(event.id, workspaceId),
    getEventHeroDisplayUrl(event.heroImageAssetId),
  ]);

  const existingRsvp = member
    ? await db.rSVP.findFirst({
        where: { workspaceId, eventId: event.id, memberId: member.id },
        select: { id: true, ticketStatus: true },
      })
    : null;

  const plusOneRsvp =
    member && existingRsvp?.ticketStatus === 'confirmed'
      ? await db.rSVP.findFirst({
          where: { workspaceId, eventId: event.id, plusOneOfMemberId: member.id },
          select: {
            id: true,
            member: { select: { firstName: true, lastName: true, email: true } },
          },
        })
      : null;

  const eventAccess = parseEventAccess(event.eventAccess);
  const viewer = resolveViewer(member, userId);
  const resolved = resolveAccessForViewer(eventAccess, viewer);

  const customQuestions = event.customQuestions.map((q) => ({
    id: q.id,
    type: q.fieldType.toLowerCase() as
      | 'text'
      | 'textarea'
      | 'select'
      | 'checkbox'
      | 'number'
      | 'date'
      | 'email'
      | 'phone',
    label: q.label,
    required: q.required,
    options: q.options.length > 0 ? q.options : undefined,
    showToMember: q.showToMember,
    showToGuest: q.showToGuest,
    whenInFlow: q.whenInFlow,
  }));

  const steps = buildSteps(
    resolved,
    viewer,
    customQuestions.map((q) => ({
      whenInFlow: q.whenInFlow,
      showToMember: q.showToMember,
      showToGuest: q.showToGuest,
    })),
  );

  const dto: EventDetailDTO = {
    eventId: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    location: event.location,
    mapsUrl: event.mapsUrl,
    runOfShow: event.runOfShow,
    eventAccess,
    viewer,
    resolved,
    steps,
    capacity: event.capacity,
    capacityUsedCount,
    showCapacity: event.showCapacity,
    plusOnesAllowed: event.plusOnesAllowed,
    heroImageUrl,
    memberApproved: member?.approved ?? false,
    memberId: member?.id ?? null,
    memberQrCode: member?.memberQrCode ?? null,
    existingRsvp: existingRsvp
      ? { id: existingRsvp.id, ticketStatus: existingRsvp.ticketStatus }
      : null,
    customQuestions,
    plusOneRsvp: plusOneRsvp
      ? {
          id: plusOneRsvp.id,
          guestName: plusOneRsvp.member
            ? `${plusOneRsvp.member.firstName} ${plusOneRsvp.member.lastName}`.trim()
            : 'Guest',
          guestEmail: plusOneRsvp.member?.email ?? '',
        }
      : null,
    template: (event.template ?? 'editorial') as 'editorial' | 'split' | 'minimal',
    // This is the live guest-facing page, not an operator preview.
    isOperator: false,
  };

  return <EventDetail event={dto} />;
}
