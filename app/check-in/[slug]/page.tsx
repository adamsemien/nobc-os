import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { mintCheckInSession } from '@/lib/check-in-session';
import { CheckInClient } from './_components/CheckInClient';

// This page is Clerk-protected by middleware. We mint an event-scoped check-in
// token here, server-side, only for an operator who is at least STAFF in the
// workspace — replacing the old NEXT_PUBLIC_CHECKIN_SECRET that shipped a global
// master key to every browser. The token is passed to the client, which caches
// it for offline check-in within its validity window.
//
// The workspace is resolved from the operator's ACTIVE Clerk session
// (getMemberWorkspaceId), exactly as app/operator/events/[id]/page.tsx does —
// NOT from a `workspace` query param. The "Check In" buttons link to
// /check-in/<slug> with no query param, so the old slug default ('nobc') never
// matched the live Clerk-derived workspace slug, minted no token, and rendered
// "Event not found".
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { userId } = await auth();
  let token: string | null = null;
  let workspaceSlug = 'nobc';
  if (userId) {
    const workspaceId = await getMemberWorkspaceId(userId);
    if (workspaceId) {
      const ws = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { slug: true },
      });
      if (ws) workspaceSlug = ws.slug;
      const event = await db.event.findFirst({
        where: { slug, workspaceId },
        select: { id: true, slug: true, startAt: true, endAt: true },
      });
      if (event) {
        token = await mintCheckInSession({ clerkUserId: userId, workspaceId, event });
      }
    }
  }

  // Preflight: if the server-only CHECKIN_SECRET is unset, mintCheckInSession
  // returns null and every door scan 401s with no signal. Surface it to the
  // operator loading this page. The secret value is never sent to the browser,
  // only this boolean result.
  const checkInSecretMissing = !process.env.CHECKIN_SECRET;

  return (
    <>
      {checkInSecretMissing && (
        <div
          role="alert"
          style={{
            background: 'var(--warning-soft)',
            color: 'var(--warning)',
            borderBottom: '1px solid var(--warning)',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Check-in is misconfigured: CHECKIN_SECRET is not set. Scans will fail until it is configured.
        </div>
      )}
      <CheckInClient eventSlug={slug} workspaceSlug={workspaceSlug} token={token} />
    </>
  );
}
