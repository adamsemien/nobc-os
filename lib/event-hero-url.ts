/**
 * Resolve an `Event.heroImageAssetId` to a renderable `<img src>`.
 *
 * New heroes are stored as a PRIVATE R2 object key (`event-hero/{workspaceId}/…`)
 * and served through the public, key-scoped presign proxy at
 * `/api/media/event-hero`. Legacy/demo heroes are stored as a full public URL
 * (Vercel Blob or an external seed image) and render directly. Pure string
 * mapping — safe to import from server and client.
 */
export function getEventHeroDisplayUrl(
  heroImageAssetId: string | null | undefined,
): string | null {
  const value = heroImageAssetId?.trim();
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value; // legacy/demo full URL
  return `/api/media/event-hero?key=${encodeURIComponent(value)}`; // private R2 key
}
