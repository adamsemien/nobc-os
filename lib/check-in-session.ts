import { OperatorRole } from '@prisma/client';
import { db } from './db';
import { getEffectiveRole, roleAtLeast } from './operator-role';
import {
  mintCheckInToken,
  checkInTokenExpiry,
  DEFAULT_CHECKIN_VALID_HOURS,
} from './check-in-token';

/** PlatformSetting key controlling how long a check-in token stays valid. */
export const CHECKIN_VALID_HOURS_KEY = 'checkin.passValidHours';

function toDate(v: Date | string | null): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

/**
 * Mint a check-in session token for an authenticated operator + a specific
 * event, server-side. Returns null when the caller is not at least STAFF for the
 * workspace, or when CHECKIN_SECRET is unset — callers pass the (possibly null)
 * token to the scanner UI, which is inert without one.
 *
 * Expiry = event end + the workspace's settable buffer hours
 * (PlatformSetting `checkin.passValidHours`, default 4, hard-capped at 72), long
 * enough to run a full event offline, short enough that it dies after.
 */
export async function mintCheckInSession(params: {
  clerkUserId: string;
  workspaceId: string;
  event: { id: string; slug: string; startAt: Date | string | null; endAt: Date | string | null };
}): Promise<string | null> {
  const role = await getEffectiveRole(params.clerkUserId, params.workspaceId);
  if (!roleAtLeast(role, OperatorRole.STAFF)) return null;

  const row = await db.platformSetting.findUnique({
    where: { workspaceId_key: { workspaceId: params.workspaceId, key: CHECKIN_VALID_HOURS_KEY } },
    select: { value: true },
  });
  const parsed = row?.value != null ? Number(row.value) : NaN;
  const validHours = Number.isFinite(parsed) ? parsed : DEFAULT_CHECKIN_VALID_HOURS;

  const expiresAt = checkInTokenExpiry(
    { startAt: toDate(params.event.startAt), endAt: toDate(params.event.endAt) },
    validHours,
  );

  return mintCheckInToken(
    { workspaceId: params.workspaceId, eventId: params.event.id, slug: params.event.slug },
    expiresAt,
  );
}
