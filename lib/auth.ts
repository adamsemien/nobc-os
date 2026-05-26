import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from './db';

export async function getOrCreateWorkspaceForUser(clerkUserId: string) {
  // Resolve against the operator's ACTIVE Clerk org (the one they selected),
  // not whichever org happens to be first in their membership list. auth() is
  // read defensively: in a non-request context (scripts, webhooks) it throws,
  // leaving activeOrgId null so the legacy first-membership fallback applies.
  let activeOrgId: string | null = null;
  try {
    activeOrgId = (await auth()).orgId ?? null;
  } catch {
    activeOrgId = null;
  }

  // Fast path: workspace already bound to the active org (skips the Clerk
  // membership lookup entirely for the common signed-in-operator case).
  if (activeOrgId) {
    const byActiveOrg = await db.workspace.findUnique({ where: { clerkOrgId: activeOrgId } });
    if (byActiveOrg) return byActiveOrg;
  }

  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUserId });

  if (!memberships.data.length) {
    throw new Error(`No organization membership found for user ${clerkUserId}`);
  }

  // Active org when set (and the user is a member of it); otherwise the first
  // membership — the original behaviour, now reached only when orgId is null.
  const activeOrg = activeOrgId
    ? memberships.data.find((m) => m.organization.id === activeOrgId)?.organization
    : undefined;
  const org = activeOrg ?? memberships.data[0].organization;
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
