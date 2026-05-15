import { presignEventHeroGet } from '@/lib/r2-presign';

/**
 * URL suitable for <img src> on member event surfaces.
 * Prefer presigned R2; else public CDN base; else same-origin proxy path.
 */
export async function getEventHeroDisplayUrl(heroImageAssetId: string | null | undefined): Promise<string | null> {
  if (!heroImageAssetId?.trim()) return null;
  const key = heroImageAssetId.trim();
  const signed = await presignEventHeroGet(key);
  if (signed) return signed;
  const publicBase = process.env.NEXT_PUBLIC_EVENT_MEDIA_BASE_URL?.replace(/\/$/, '');
  if (publicBase) return `${publicBase}/${encodeURIComponent(key)}`;
  return `/api/media/event-hero/${encodeURIComponent(key)}`;
}
