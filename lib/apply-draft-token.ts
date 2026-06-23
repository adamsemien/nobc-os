import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Apply-draft access token — binds the public membership-draft endpoints
 * (GET / PATCH / submit on /api/apply/membership/[id]) to the browser that
 * created the draft.
 *
 * The draft id travels in the page URL (`?id=`) and is therefore exposed via the
 * address bar, browser history, and Referer headers. On its own the id is a
 * bearer key: GET leaks the applicant's PII and PATCH overwrites their contact
 * details. This token is set as an httpOnly cookie when the draft is created and
 * verified on every read/write/submit, so possession of the id alone is no
 * longer enough.
 *
 * Signing key prefers APPLY_DRAFT_SECRET, then CLERK_SECRET_KEY (an
 * always-required env var). Falling back to an always-present secret is
 * deliberate: this guards the PUBLIC top-of-funnel, so a missing OPTIONAL env
 * var must NOT fail closed and break every applicant's save (unlike check-in,
 * which is a gated operator feature). Set APPLY_DRAFT_SECRET to rotate
 * independently of Clerk.
 */

export const APPLY_DRAFT_COOKIE = 'nobc_apply_draft';

/** 30 days — long enough to resume an abandoned draft, bounded so a leaked
 *  cookie does not live forever. */
export const APPLY_DRAFT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string | null {
  return process.env.APPLY_DRAFT_SECRET || process.env.CLERK_SECRET_KEY || null;
}

/** Sign an access token for a draft id. Returns null only if no secret exists. */
export function signApplyDraftToken(applicationId: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac('sha256', s).update(applicationId).digest('base64url');
}

/** Constant-time check that `token` authorizes access to `applicationId`. */
export function verifyApplyDraftToken(
  applicationId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = signApplyDraftToken(applicationId);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
