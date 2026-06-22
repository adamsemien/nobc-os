/**
 * POST /api/stories/generate — Generate Instagram Stories from DAM assets.
 *
 * Accepts DAM asset IDs, applies text overlays (event name + day counter),
 * resizes to Instagram Story format (1080x1920 PNG), stores in R2, returns signed URL.
 *
 * Request body:
 *   assetIds: string[] (DAM asset IDs)
 *   eventName: string
 *   dayCount: number
 *   position?: 'top' | 'center' | 'bottom' (default: 'bottom')
 *
 * Auth: STAFF role required
 */

import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { uploadObject, presignGet, DOWNLOAD_URL_TTL } from '@/lib/dam/storage';

export const runtime = 'nodejs';

interface GenerateStoryRequest {
  assetIds: string[];
  eventName: string;
  dayCount: number;
  position?: 'top' | 'center' | 'bottom';
}

interface GeneratedStory {
  storyId: string;
  storyUrl: string;
  assetId: string;
}

/**
 * Fetch image from signed URL, return Buffer.
 */
async function fetchAssetBuffer(signedUrl: string): Promise<Buffer> {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generate Instagram Story (1080x1920 PNG) with text overlay.
 */
async function generateStory(
  assetBuffer: Buffer,
  eventName: string,
  dayCount: number,
  position: 'top' | 'center' | 'bottom' = 'bottom',
): Promise<Buffer> {
  const STORY_WIDTH = 1080;
  const STORY_HEIGHT = 1920;
  const FONT_SIZE = 72;
  const PADDING = 60;

  // Determine Y position for text overlay
  let yPosition: number;
  switch (position) {
    case 'top':
      yPosition = PADDING;
      break;
    case 'center':
      yPosition = STORY_HEIGHT / 2 - FONT_SIZE;
      break;
    case 'bottom':
    default:
      yPosition = STORY_HEIGHT - PADDING - FONT_SIZE * 2;
  }

  // Create SVG text overlay with NoBC red (#FF4520) + subtle shadow
  const svg = Buffer.from(`
    <svg width="${STORY_WIDTH}" height="${STORY_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="2" dy="2" stdDeviation="4" flood-opacity="0.5" flood-color="#000000" />
        </filter>
      </defs>
      <text 
        x="${STORY_WIDTH / 2}" 
        y="${yPosition + FONT_SIZE}" 
        font-family="System-UI, Arial, sans-serif" 
        font-size="${FONT_SIZE}" 
        font-weight="bold"
        fill="#FF4520" 
        text-anchor="middle"
        filter="url(#shadow)"
        style="dominant-baseline: hanging"
      >${eventName}</text>
      <text 
        x="${STORY_WIDTH / 2}" 
        y="${yPosition + FONT_SIZE + 80}" 
        font-family="System-UI, Arial, sans-serif" 
        font-size="48" 
        font-weight="600"
        fill="#FFFFFF" 
        text-anchor="middle"
        filter="url(#shadow)"
        style="dominant-baseline: hanging"
      >Day ${dayCount}</text>
    </svg>
  `);

  // Resize + compose overlay
  return sharp(assetBuffer)
    .resize(STORY_WIDTH, STORY_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .composite([{ input: svg }])
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth gate: STAFF role required
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  // Parse request
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const {
    assetIds,
    eventName,
    dayCount,
    position,
  }: GenerateStoryRequest = body;

  // Validate inputs
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json({ error: 'assetIds must be non-empty array' }, { status: 400 });
  }
  if (typeof eventName !== 'string' || eventName.trim().length === 0) {
    return NextResponse.json({ error: 'eventName required' }, { status: 400 });
  }
  if (typeof dayCount !== 'number' || dayCount < 1) {
    return NextResponse.json({ error: 'dayCount must be positive number' }, { status: 400 });
  }

  try {
    const stories: GeneratedStory[] = [];

    for (const assetId of assetIds) {
      // Fetch asset metadata (R2 key is stored in `url` field)
      const asset = await db.asset.findFirst({
        where: { id: assetId, workspaceId },
        select: { url: true },
      });
      if (!asset?.url) {
        return NextResponse.json(
          { error: `Asset ${assetId} not found in workspace` },
          { status: 404 },
        );
      }

      // Get signed URL for the asset in R2
      const assetSignedUrl = await presignGet(asset.url, DOWNLOAD_URL_TTL);
      if (!assetSignedUrl) {
        return NextResponse.json(
          { error: `Could not sign URL for asset ${assetId}` },
          { status: 500 },
        );
      }

      // Download asset from R2
      const assetBuffer = await fetchAssetBuffer(assetSignedUrl);

      // Generate story (overlay + resize to 1080x1920)
      const storyBuffer = await generateStory(
        assetBuffer,
        eventName,
        dayCount,
        (position as 'top' | 'center' | 'bottom' | undefined) || 'bottom',
      );

      // Upload story to R2 under /stories/
      const storyId = randomUUID();
      const storyKey = `stories/${workspaceId}/${storyId}.png`;
      await uploadObject(storyKey, storyBuffer, 'image/png');

      // Get signed URL for story
      const storyUrl = await presignGet(storyKey, DOWNLOAD_URL_TTL);
      if (!storyUrl) {
        return NextResponse.json(
          { error: `Could not sign story URL for ${storyId}` },
          { status: 500 },
        );
      }

      stories.push({
        storyId,
        storyUrl,
        assetId,
      });
    }

    return NextResponse.json({ stories }, { status: 200 });
  } catch (err) {
    console.error('Failed to generate stories:', err);
    return NextResponse.json(
      { error: 'Failed to generate stories' },
      { status: 500 },
    );
  }
}
