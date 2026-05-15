import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { getEventBySlug, getCapacityUsedRsvpCount } from '@/lib/events';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';
import {
  parseEventAccess,
  resolveViewer,
  resolveAccessForViewer,
  buildSteps,
} from '@/lib/event-access';
import { MemberWorkspaceGate } from '../_components/MemberWorkspaceGate';
import { EventDetail, type EventDetailDTO } from './_components/EventDetail';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect('/');
  }
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return <MemberWorkspaceGate />;
  }

  const event = await getEventBySlug(workspaceId, slug);
  if (!event) notFound();

  const [member, capacityUsedCount, heroImageUrl] = await Promise.all([
    db.member.findFirst({
      where: { workspaceId, clerkUserId: userId },
      select: { id: true, approved: true, status: true, memberQrCode: true },
    }),
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
    // Member pages are org-gated, so any viewer who isn't an approved member
    // is an operator previewing the page.
    isOperator: viewer !== 'member',
  };

  return <EventDetail event={dto} />;
}
