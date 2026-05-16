/**
 * Hero imagery is stored as a full public URL on Event.heroImageAssetId
 * (Vercel Blob: https://….public.blob.vercel-storage.com/…).
 */
export function getEventHeroDisplayUrl(
  heroImageAssetId: string | null | undefined,
): string | null {
  const value = heroImageAssetId?.trim();
  return value || null;
}
