import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { resolveMember } from '@/lib/member-identity';

export type ClerkMemberRow = {
  id: string;
  approved: boolean;
  memberQrCode: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

/** Creates a pending Member from the signed-in Clerk profile (for OPEN RSVP / checkout). */
export async function getOrCreateMemberFromClerk(
  workspaceId: string,
  clerkUserId: string,
): Promise<ClerkMemberRow | null> {
  const existing = await db.member.findFirst({
    where: { workspaceId, clerkUserId },
    select: { id: true, approved: true, memberQrCode: true, firstName: true, lastName: true, email: true },
  });
  if (existing) return existing;

  const client = await clerkClient();
  const u = await client.users.getUser(clerkUserId);
  const email = u.emailAddresses[0]?.emailAddress?.trim().toLowerCase();
  if (!email) return null;

  const emailTaken = await db.member.findFirst({
    where: { workspaceId, email },
    select: { id: true },
  });
  if (emailTaken) return null;

  const firstName = u.firstName?.trim() || 'Guest';
  const lastName = u.lastName?.trim() || '';

  // Mint through the canonical path so the row gets a memberQrCode (QR law) and a
  // consistent GUEST status. The email-taken guard above preserves the prior
  // behavior of not attaching a new Clerk user onto an existing member's email.
  const resolved = await resolveMember({
    workspaceId,
    email,
    name: `${firstName} ${lastName}`.trim(),
    clerkUserId,
    source: 'clerk_open_rsvp',
  });
  return {
    id: resolved.id,
    approved: resolved.approved,
    memberQrCode: resolved.memberQrCode,
    firstName: resolved.firstName,
    lastName: resolved.lastName,
    email: resolved.email,
  };
}
