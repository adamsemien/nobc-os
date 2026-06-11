import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

/** Root router.
 *
 *  - Signed-out users → /apply (public application form is the front door).
 *  - Approved members → /m (member portal home).
 *  - Has workspace/org → /operator (operator dashboard).
 *  - Orgless, not an approved member → /m/events (neutral landing; buyer persona).
 *
 *  The orgless branch is dormant while Clerk "organizations required" is ON
 *  (every signed-in user will have an org). It becomes active once Adam flips
 *  that setting OFF so buyers can sign in without creating an org. */
export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect('/apply');

  // Approved member → portal. If a user has BOTH an org membership and a
  // member record, members get priority — they're more likely to land here
  // from the member-side login flow.
  const member = await db.member.findFirst({
    where: { clerkUserId: userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (member) redirect('/m');

  // Has a workspace (backed by a Clerk org) → operator dashboard.
  // getMemberWorkspaceId returns null for orgless users (safe accessor).
  const workspaceId = await getMemberWorkspaceId(userId);
  if (workspaceId) redirect('/operator');

  // Orgless, not an approved member — buyer persona. Route to a neutral
  // landing rather than /operator (which assumes a workspace) or /onboarding
  // (which they didn't explicitly request).
  redirect('/m/events');
}
