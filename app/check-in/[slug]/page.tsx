import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { mintCheckInSession } from '@/lib/check-in-session';
import { CheckInClient } from './_components/CheckInClient';

// This page is Clerk-protected by middleware. We mint an event-scoped check-in
// token here, server-side, only for an operator who is at least STAFF in the
// workspace — replacing the old NEXT_PUBLIC_CHECKIN_SECRET that shipped a global
// master key to every browser. The token is passed to the client, which caches
// it for offline check-in within its validity window.
export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { slug } = await params;
  const { workspace: workspaceSlug = 'nobc' } = await searchParams;

  const { userId } = await auth();
  let token: string | null = null;
  if (userId) {
    const ws = await db.workspace.findUnique({ where: { slug: workspaceSlug }, select: { id: true } });
    if (ws) {
      const event = await db.event.findFirst({
        where: { slug, workspaceId: ws.id },
        select: { id: true, slug: true, startAt: true, endAt: true },
      });
      if (event) {
        token = await mintCheckInSession({ clerkUserId: userId, workspaceId: ws.id, event });
      }
    }
  }

  return <CheckInClient eventSlug={slug} workspaceSlug={workspaceSlug} token={token} />;
}
