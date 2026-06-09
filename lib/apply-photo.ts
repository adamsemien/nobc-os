/**
 * Application portrait references — storage + rendering helpers.
 *
 * Membership-application photos are PII-adjacent, so the uploaded objects live
 * in private R2 (same bucket as the DAM, `applications/{workspaceId}/` prefix)
 * and are NEVER world-readable. A stored value in the `photos.urls` answer is
 * therefore EITHER:
 *   - a private R2 object key      → served through the role-gated presign proxy
 *   - a full http(s) URL           → legacy / demo (e.g. picsum); rendered as-is
 *
 * This module holds only PURE string helpers (no aws-sdk, no secrets) so it is
 * safe to import from client components as well as server routes.
 */

const APPLICATION_PREFIX = 'applications/';

/** True for a full http(s) URL (legacy public-blob or external demo image). */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

/** A renderable portrait reference: a full URL, or a private R2 application key. */
export function isPortraitRef(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    (isHttpUrl(value) || value.startsWith(APPLICATION_PREFIX))
  );
}

/**
 * Map a stored portrait reference to an `<img src>`. Full URLs pass through
 * (legacy/demo); private R2 keys route through the authenticated presign proxy,
 * which re-signs on every load so the browser never holds an expired URL.
 */
export function portraitSrc(value: string): string {
  if (isHttpUrl(value)) return value;
  return `/api/media/application-photo?key=${encodeURIComponent(value)}`;
}

/** Object key for a freshly uploaded application portrait (private R2). */
export function applicationPhotoKey(workspaceId: string, ext: string): string {
  const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${APPLICATION_PREFIX}${workspaceId}/${rand}.${ext}`;
}

/**
 * Guard a caller-supplied key against cross-tenant access (IDOR): it must live
 * under this workspace's application prefix and contain no path traversal.
 */
export function isWorkspacePhotoKey(key: string, workspaceId: string): boolean {
  return (
    typeof key === 'string' &&
    key.startsWith(`${APPLICATION_PREFIX}${workspaceId}/`) &&
    !key.includes('..')
  );
}
