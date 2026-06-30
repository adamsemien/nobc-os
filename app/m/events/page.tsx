import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getMemberWorkspaceId } from '@/lib/auth';
import { getPublishedEventsWithConfirmedCounts } from '@/lib/events';
import { getEventHeroDisplayUrl } from '@/lib/event-hero-url';
import ApplicantStatus from '@/app/m/_components/ApplicantStatus';
import MemberEventsExplorer, { type MemberEventsExplorerRow } from './_components/MemberEventsExplorer';
import { LegalFooter } from '@/app/_components/LegalFooter';

const applySlug = process.env.NEXT_PUBLIC_APPLY_SLUG?.trim();
const applyHref = `/apply/${applySlug && applySlug.length > 0 ? applySlug : 'nobc'}`;

export default async function EventsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/');
  }
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    // Orgless caller. ApplicantStatus renders the status-aware applicant landing
    // for prospects/applicants, and (for a member with no application) falls back
    // to the members-only surface itself — so members are never shown applicant
    // copy and are never bounced into /apply.
    return <ApplicantStatus />;
  }
  const raw = await getPublishedEventsWithConfirmedCounts(workspaceId);

  const rows: MemberEventsExplorerRow[] = await Promise.all(
    raw.map(async e => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startAt: e.startAt.toISOString(),
      location: e.location,
      accessMode: e.accessMode,
      showCapacity: e.showCapacity,
      capacity: e.capacity,
      confirmedRsvpCount: e.confirmedRsvpCount,
      heroImageUrl: getEventHeroDisplayUrl(e.heroImageAssetId),
      priceInCents: e.priceInCents,
    })),
  );

  return (
    <>
      <MemberEventsExplorer events={rows} applyHref={applyHref} />
      <LegalFooter />
    </>
  );
}
