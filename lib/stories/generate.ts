/**
 * Instagram Story generation — Sharp-based overlay composition.
 *
 * Creates 1080x1920 PNG stories with:
 * - Base image (scaled/cropped from source asset)
 * - Event name overlay (top)
 * - Day counter badge (optional, e.g. "Day 3")
 * - Branding (bottom: workspace logo + NoBC watermark)
 *
 * Exported to R2 under `stories/{workspaceId}/{storyId}/story.png`.
 */

import sharp from 'sharp';

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

export interface StoryOverlayConfig {
  baseImageBuffer: Buffer;
  eventName?: string;
  dayCounter?: number;
  workspaceLogoUrl?: string; // URL or base64-encoded image
  textPosition?: 'top' | 'center' | 'bottom';
}

export interface GeneratedStory {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/**
 * Generate a 1080x1920 PNG Instagram story with text overlays and branding.
 */
export async function generateStoryImage(config: StoryOverlayConfig): Promise<GeneratedStory> {
  const image = sharp(config.baseImageBuffer, { failOn: 'none' });

  // Normalize the base image to story dimensions (1080x1920).
  // Use "cover" to fill the entire story without gaps, cropping if needed.
  const baseMetadata = await image.metadata();
  const baseWidth = baseMetadata.width ?? STORY_WIDTH;
  const baseHeight = baseMetadata.height ?? STORY_HEIGHT;

  // Calculate crop/resize to maintain aspect ratio
  const baseAspect = baseWidth / baseHeight;
  const storyAspect = STORY_WIDTH / STORY_HEIGHT;

  let resizeWidth = STORY_WIDTH;
  let resizeHeight = STORY_HEIGHT;

  if (baseAspect > storyAspect) {
    // Base is wider (landscape) — scale height, crop width
    resizeHeight = Math.round(STORY_WIDTH / baseAspect);
    if (resizeHeight < STORY_HEIGHT) {
      resizeWidth = Math.round(STORY_HEIGHT * baseAspect);
      resizeHeight = STORY_HEIGHT;
    }
  } else {
    // Base is taller (portrait) — scale width, crop height
    resizeWidth = Math.round(STORY_HEIGHT * baseAspect);
    if (resizeWidth < STORY_WIDTH) {
      resizeWidth = STORY_WIDTH;
      resizeHeight = Math.round(STORY_WIDTH / baseAspect);
    }
  }

  const resize = await image
    .rotate() // honor EXIF
    .resize(resizeWidth, resizeHeight, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();

  // Now compose overlays on top.
  const canvas = await sharp({
    create: {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      channels: 3,
      background: { r: 20, g: 20, b: 20 }, // Dark bg for safety
    },
  })
    .composite([
      {
        input: resize,
        left: Math.round((STORY_WIDTH - resizeWidth) / 2),
        top: Math.round((STORY_HEIGHT - resizeHeight) / 2),
      },
    ])
    .png();

  // Add overlays
  const overlays: sharp.OverlayOptions[] = [];

  // Event name overlay (position-aware)
  if (config.eventName) {
    const positionY =
      config.textPosition === 'bottom'
        ? STORY_HEIGHT - 220
        : config.textPosition === 'center'
          ? STORY_HEIGHT / 2
          : 200; // top (default)
    overlays.push(
      await createTextOverlay(config.eventName, {
        fontSize: 72,
        x: STORY_WIDTH / 2,
        y: positionY,
        maxWidth: STORY_WIDTH - 60,
        bold: true,
      })
    );
  }

  // Day counter badge (right side, near top)
  if (config.dayCounter != null) {
    overlays.push(
      await createBadgeOverlay(`Day ${config.dayCounter}`, {
        fontSize: 48,
        x: STORY_WIDTH - 150,
        y: 150,
      })
    );
  }

  // Branding footer text
  const brandText = 'NoBC Stories';
  overlays.push(
    await createTextOverlay(brandText, {
      fontSize: 36,
      x: STORY_WIDTH / 2,
      y: STORY_HEIGHT - 120,
      maxWidth: STORY_WIDTH - 60,
      bold: false,
      color: '#CCCCCC',
    })
  );

  // Compose all overlays
  if (overlays.length > 0) {
    for (const overlay of overlays) {
      canvas.composite([overlay]);
    }
  }

  const buffer = await canvas.png().toBuffer();

  return {
    buffer,
    contentType: 'image/png',
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
  };
}

interface TextOverlayOpts {
  fontSize: number;
  x: number;
  y: number;
  maxWidth?: number;
  bold?: boolean;
  color?: string;
}

/**
 * Create a text SVG for overlay. Returns a PNG buffer for composition.
 */
async function createTextOverlay(
  text: string,
  opts: TextOverlayOpts
): Promise<sharp.OverlayOptions> {
  const { fontSize, x, y, maxWidth = 500, bold = false, color = '#FFFFFF' } = opts;

  // Simple SVG text element. For multi-line support, split on spaces and wrap.
  // (A more robust impl would use a text-measure library.)
  const fontWeight = bold ? 'bold' : 'normal';
  const svg = `
    <svg width="${maxWidth}" height="${fontSize * 2}">
      <text
        x="0"
        y="${fontSize}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${fontSize}"
        font-weight="${fontWeight}"
        fill="${color}"
        text-anchor="start"
        dominant-baseline="baseline"
        word-wrap="break-word"
        style="word-break: break-word; overflow-wrap: break-word;"
      >
        ${escapeXml(text)}
      </text>
    </svg>
  `;

  return {
    input: Buffer.from(svg),
    left: Math.round(x - maxWidth / 2), // Center horizontally
    top: Math.round(y - fontSize / 2),
  };
}

/**
 * Create a badge (rounded rectangle with text).
 */
async function createBadgeOverlay(
  text: string,
  opts: TextOverlayOpts
): Promise<sharp.OverlayOptions> {
  const { fontSize, x, y } = opts;
  const padding = 20;
  const width = text.length * (fontSize * 0.5) + padding * 2; // Rough estimate
  const height = fontSize + padding * 2;

  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#FF3B30" rx="12" ry="12" />
      <text
        x="${width / 2}"
        y="${height / 2 + fontSize / 3}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="#FFFFFF"
        text-anchor="middle"
        dominant-baseline="central"
      >
        ${escapeXml(text)}
      </text>
    </svg>
  `;

  return {
    input: Buffer.from(svg),
    left: Math.round(x - width / 2),
    top: Math.round(y - height / 2),
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
