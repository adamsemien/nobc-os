import { clerkClient } from '@clerk/nextjs/server';
import { db } from './db';
import { resolveDefaultApplyWorkspace } from './apply-workspace';

/**
 * Account-link layer for resumable membership applications (PR1, dark).
 *
 * Lets a signed-in applicant own + resume their in-progress `Application` across
 * devices, keyed to their Clerk account rather than the device-bound draft
 * cookie. Email is the source of truth via the applicant's VERIFIED Clerk
 * primary email only — never a user-supplied string. Everything here is additive
 * and idempotent; the anonymous (cookie) path is untouched.
 */

/** Verified primary email for a Clerk user, trimmed + lowercased. Returns null
 *  when the user is missing, has no primary email, or the email is unverified. */
export async function getVerifiedClerkEmail(clerkUserId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    const primary = user.primaryEmailAddress;
    if (!primary || primary.verification?.status !== 'verified') return null;
    const email = primary.emailAddress.trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the signed-in caller's in-progress (PENDING) application, linking it to
 * their account if needed. Safe to call on every authenticated entry.
 *
 * Resolution order:
 *  1. Fast path — an application already stamped with this `clerkUserId`.
 *  2. Slow path — a PENDING application in the default apply workspace matched by
 *     the caller's VERIFIED Clerk email, which is then stamped with `clerkUserId`.
 *
 * The stamp is an idempotent `updateMany` guarded so it never steals a draft
 * already owned by a different account (a concurrent call or re-entry is a
 * 0-row no-op). Returns the resolved application id, or null when there is
 * nothing to resume.
 */
export async function resolvePendingApplicationForAccount(
  clerkUserId: string,
): Promise<{ id: string } | null> {
  // Fast path: already linked to this account.
  const linked = await db.application.findFirst({
    where: { clerkUserId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (linked) return linked;

  // Slow path: match an anonymous (cookie) draft by verified email, then stamp.
  const email = await getVerifiedClerkEmail(clerkUserId);
  if (!email) return null;

  const workspace = await resolveDefaultApplyWorkspace();
  if (!workspace) return null;

  const candidate = await db.application.findFirst({
    where: {
      workspaceId: workspace.id,
      email: { equals: email, mode: 'insensitive' },
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, clerkUserId: true },
  });
  if (!candidate) return null;

  // Never resume a draft already claimed by a different account.
  if (candidate.clerkUserId && candidate.clerkUserId !== clerkUserId) return null;

  await db.application.updateMany({
    where: { id: candidate.id, OR: [{ clerkUserId: null }, { clerkUserId }] },
    data: { clerkUserId },
  });
  return { id: candidate.id };
}

/**
 * Idempotently stamp `clerkUserId` onto a specific application the caller already
 * owns/created (used by the create route when a draft is made while signed in).
 * Guarded so it never overwrites another account's claim.
 */
export async function stampApplicationOwner(
  applicationId: string,
  clerkUserId: string,
): Promise<void> {
  await db.application.updateMany({
    where: { id: applicationId, OR: [{ clerkUserId: null }, { clerkUserId }] },
    data: { clerkUserId },
  });
}

/**
 * True when `clerkUserId` owns the application via the account link. Used by the
 * draft GET / PATCH / submit endpoints as the additive alternative to the
 * device-bound cookie (enables a signed-in cross-device resume).
 */
export async function isApplicationAccountOwner(
  applicationId: string,
  clerkUserId: string | null | undefined,
): Promise<boolean> {
  if (!clerkUserId) return false;
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { clerkUserId: true },
  });
  return app?.clerkUserId != null && app.clerkUserId === clerkUserId;
}
