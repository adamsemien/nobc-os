import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import RsvpList from './_components/RsvpList';

export default async function RsvpsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) redirect('/apply');

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true },
  });

  const rsvps = member
    ? await db.rSVP.findMany({
        where: { workspaceId, memberId: member.id },
        include: {
          event: { select: { id: true, title: true, startAt: true, location: true, slug: true } },
          tier: { select: { name: true } },
        },
        orderBy: [{ event: { startAt: 'desc' } }],
      })
    : [];

  const serialized = rsvps.map((r) => ({
    id: r.id,
    ticketStatus: r.ticketStatus,
    paymentStatus: r.paymentStatus ?? null,
    isComp: r.isComp,
    createdAt: r.createdAt.toISOString(),
    tierName: r.tier?.name ?? null,
    event: {
      id: r.event.id,
      title: r.event.title,
      startAt: r.event.startAt.toISOString(),
      location: r.event.location ?? null,
      slug: r.event.slug,
    },
  }));

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-10">
      <h1
        className="text-2xl font-normal mb-8"
        style={{
          color: 'var(--events-fg)',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
        }}
      >
        My RSVPs
      </h1>
      <RsvpList rsvps={serialized} />
    </div>
  );
}
