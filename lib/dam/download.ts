/**
 * DAM download size presets.
 *
 * DOWNLOAD_SIZES maps a preset name to its target width (px), or null for the
 * original (no resize). Exported so the download route, the UI, and unit tests
 * all share the same source of truth.
 *
 * parseDownloadSize is pure (no I/O) — safe to unit-test in isolation.
 */

export type DownloadSize = 'small' | 'medium' | 'large' | 'original';

/** Target widths per preset. null = pass-through (no resize). */
export const DOWNLOAD_SIZES: Record<DownloadSize, number | null> = {
  small: 640,
  medium: 1280,
  large: 2048,
  original: null,
};

const VALID_SIZES = new Set<string>(Object.keys(DOWNLOAD_SIZES));

/**
 * Validate and narrow a raw query-param value to a DownloadSize.
 * Unknown / missing values default to 'original'.
 */
export function parseDownloadSize(raw: string | null): DownloadSize {
  if (raw && VALID_SIZES.has(raw)) return raw as DownloadSize;
  return 'original';
}
