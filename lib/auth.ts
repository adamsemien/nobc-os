import { clerkClient } from '@clerk/nextjs/server';
import { db } from './db';

export async function getOrCreateWorkspaceForUser(clerkUserId: string) {
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });

  if (!memberships.data.length) {
    throw new Error(`No organization membership found for user ${clerkUserId}`);
  }

  const org = memberships.data[0].organization;
  const orgSlug = org.slug ?? org.id;

  // Fast path: workspace already bound to this Clerk org
  const byOrgId = await db.workspace.findUnique({ where: { clerkOrgId: org.id } });
  if (byOrgId) return byOrgId;

  // Reconcile seeded workspace: if a workspace with the org slug exists but has a
  // placeholder clerkOrgId (from seed-workspace.mjs), bind the real org ID to it.
  const bySlug = await db.workspace.findUnique({ where: { slug: orgSlug } });
  if (bySlug) {
    return db.workspace.update({
      where: { id: bySlug.id },
      data: { clerkOrgId: org.id, name: org.name },
    });
  }

  return db.workspace.create({
    data: { clerkOrgId: org.id, name: org.name, slug: orgSlug },
  });
}

export async function requireWorkspaceId(clerkUserId: string): Promise<string> {
  const workspace = await getOrCreateWorkspaceForUser(clerkUserId);
  return workspace.id;
}

/** Returns workspace id, or null if user is missing or has no org / workspace cannot be resolved. */
export async function getMemberWorkspaceId(
  clerkUserId: string | null | undefined,
): Promise<string | null> {
  if (!clerkUserId) return null;
  try {
    const workspace = await getOrCreateWorkspaceForUser(clerkUserId);
    return workspace.id;
  } catch {
    return null;
  }
}
