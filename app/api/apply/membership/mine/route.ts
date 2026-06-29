import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolvePendingApplicationForAccount } from '@/lib/apply-account-link';

/**
 * Resume resolver — returns the signed-in caller's in-progress application id, if
 * any. `{ id }` when a PENDING application is owned-by or claimable-by this
 * account (matched by verified Clerk email and stamped); `{ id: null }` otherwise.
 *
 * Dark in PR1: there is no caller yet. PR3 uses it to resume an application
 * cross-device, independent of the device-bound draft cookie.
 *
 * Static segment `mine` resolves ahead of the sibling dynamic `[id]` route.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const application = await resolvePendingApplicationForAccount(userId);
  return NextResponse.json({ id: application?.id ?? null });
}
