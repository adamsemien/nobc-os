/**
 * POST /api/media/dam/asset/[id]/alt-text — generate accessibility alt-text for a
 * photo via Claude vision (MECHANICAL_MODEL, Haiku 4.5). STAFF-gated,
 * workspace-scoped. Returns the suggested text (not persisted — there is no
 * altText column yet; the operator copies it into their newsletter/post).
 */
import { NextRequest, NextResponse } from 'next/server';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { presignGet } from '@/lib/dam/storage';
import { MECHANICAL_MODEL } from '@/lib/ai/runtime-models';

export const runtime = 'nodejs';
export const maxDuration = 30;

const ALT_TEXT_MODEL = MECHANICAL_MODEL;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await ctx.params;

  const asset = await db.asset.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: { url: true, thumbnailUrl: true, fileType: true },
  });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (asset.fileType !== 'PHOTO') {
    return NextResponse.json({ error: 'Alt-text is available for photos only' }, { status: 400 });
  }

  // Use the thumbnail (smaller payload, ample for description).
  const signed = await presignGet(asset.thumbnailUrl || asset.url, 300);
  if (!signed) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  const res = await fetch(signed);
  if (!res.ok) return NextResponse.json({ error: 'Could not read image' }, { status: 502 });
  const bytes = new Uint8Array(await res.arrayBuffer());

  try {
    const { text } = await generateText({
      model: anthropic(ALT_TEXT_MODEL),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Write concise, descriptive alt-text for this image for screen-reader accessibility. One sentence, ~15 words max, no leading phrases like "image of". Return only the alt text.',
            },
            { type: 'image', image: bytes },
          ],
        },
      ],
    });
    const altText = text.trim().replace(/^["']|["']$/g, '');
    return NextResponse.json({ altText });
  } catch (err) {
    console.error('[dam/alt-text] generation failed', {
      assetId: id,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Could not generate alt text' }, { status: 502 });
  }
}
