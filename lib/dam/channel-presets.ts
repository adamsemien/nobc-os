/**
 * Named resize presets for popular channels + email. The public image route
 * (`/i/[token]?preset=…`) and the editor's "Export for…" menu both read these.
 * `cover` crops to fill the box (subject may be trimmed); `inside` scales to fit
 * within the box without cropping.
 */
export type ChannelFit = 'cover' | 'inside';

export interface ChannelPreset {
  key: string;
  label: string;
  width: number;
  height?: number; // omitted → width-constrained, height auto (email)
  fit: ChannelFit;
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  { key: 'ig-story', label: 'Instagram Story (9:16)', width: 1080, height: 1920, fit: 'cover' },
  { key: 'ig-post', label: 'Instagram Post (1:1)', width: 1080, height: 1080, fit: 'cover' },
  { key: 'ig-portrait', label: 'Instagram Portrait (4:5)', width: 1080, height: 1350, fit: 'cover' },
  { key: 'ig-landscape', label: 'Instagram Landscape (1.91:1)', width: 1080, height: 566, fit: 'cover' },
  { key: 'email', label: 'Email / Newsletter (600w)', width: 600, fit: 'inside' },
  { key: 'email-2x', label: 'Email @2x retina (1200w)', width: 1200, fit: 'inside' },
  { key: 'fb-share', label: 'Facebook Share (1.91:1)', width: 1200, height: 630, fit: 'cover' },
  { key: 'x-post', label: 'X / Twitter (16:9)', width: 1600, height: 900, fit: 'cover' },
];

export const CHANNEL_PRESET_MAP: Record<string, ChannelPreset> = Object.fromEntries(
  CHANNEL_PRESETS.map((p) => [p.key, p]),
);

/** Hard ceiling on arbitrary `?w` / `?h` params on the public route. */
export const MAX_PUBLIC_DIMENSION = 4096;
