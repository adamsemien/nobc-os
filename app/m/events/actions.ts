'use server';

import { auth } from '@clerk/nextjs/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { submitMemberRsvp, type RsvpSubmitBody } from '@/lib/rsvp-submit';

export async function submitRsvpAction(body: RsvpSubmitBody) {
  const { userId } = await auth();
  if (!userId) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return { ok: false as const, status: 403, error: 'No workspace' };
  return submitMemberRsvp(workspaceId, userId, body);
}
