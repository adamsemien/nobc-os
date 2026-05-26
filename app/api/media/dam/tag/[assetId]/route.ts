/**
 * DAM async tag + score (internal). Invoked fire-and-forget by the upload route
 * AFTER the upload response, so AI work never blocks upload. Optionally guarded
 * by DAM_TAG_SECRET (x-dam-tag-secret header). Writes Asset.aiTags + energyLevel
 * (+ heuristic qualityScore/qualityScores). All failures are logged, not thrown.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DISPLAY_URL_TTL, presignGet } from '@/lib/dam/storage';
import { scoreImage } from '@/lib/dam/image';
import { inferEnergyLevel, tagImage } from '@/lib/dam/tagging';

export const runtime = 'nodejs'; // Sharp (scoreImage) requires the Node runtime.

export async function POST(req: NextRequest, ctx: { params: Promise<{ assetId: string }> }) {
  const secret = process.env.DAM_TAG_SECRET;
  if (secret && req.headers.get('x-dam-tag-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { id: true, url: true },
  });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const signedUrl = await presignGet(asset.url, DISPLAY_URL_TTL);
  if (!signedUrl) {
    console.error('[dam/tag] could not presign asset for tagging', { assetId });
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  }

  // Provider-abstracted tagging (returns [] when unconfigured — never throws).
  const aiTags = await tagImage(signedUrl);
  const energyLevel = inferEnergyLevel(aiTags);

  // Heuristic scoring from the actual bytes (Sharp). Best-effort.
  let scores: Awaited<ReturnType<typeof scoreImage>> | null = null;
  try {
    const res = await fetch(signedUrl);
    if (res.ok) {
      scores = await scoreImage(Buffer.from(await res.arrayBuffer()));
    }
  } catch (err) {
    console.error('[dam/tag] scoring failed', {
      assetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await db.asset.update({
    where: { id: assetId },
    data: {
      aiTags,
      energyLevel: energyLevel ?? undefined,
      ...(scores
        ? {
            qualityScore: scores.qualityScore,
            qualityScores: scores.qualityScores as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    aiTags,
    energyLevel,
    qualityScore: scores?.qualityScore ?? null,
  });
}
