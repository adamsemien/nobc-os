/**
 * GET /api/media/dam/assets/semantic — CLIP semantic search over DAM assets.
 *
 * Embeds the ?q= text query into the 768-d CLIP space (same space as the stored
 * asset embeddings), then returns assets ordered by cosine distance (closest first).
 *
 * Degrades gracefully: if Replicate is unconfigured or down, returns
 * { assets: [], nextCursor: null, degraded: true } with HTTP 200 so the UI
 * can fall back to keyword search without an error state.
 *
 * Query params:
 *   q          (required) — natural-language search query
 *   cursor     — numeric offset string for pagination (same shape as grid route)
 *   fileType   — 'PHOTO' | 'VIDEO'
 *   folderId   — filter to folder
 *   eventId    — filter to event
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { embedText } from '@/lib/dam/embedding';
import { buildSemanticQuery } from '@/lib/dam/semantic';

export const runtime = 'nodejs';
const PAGE = 60;

export async function GET(req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ assets: [], nextCursor: null });
  }

  const offset = sp.get('cursor') ? Math.max(0, parseInt(sp.get('cursor')!, 10) || 0) : 0;

  const fileType = sp.get('fileType');
  const folderId = sp.get('folderId') || undefined;
  const eventId = sp.get('eventId') || undefined;

  const queryVec = await embedText(q);
  if (!queryVec) {
    // Replicate is down or unconfigured — log already happened in embedText.
    console.warn(`[api/dam/assets/semantic] embed returned null for q="${q.slice(0, 80)}", degrading to empty result`);
    return NextResponse.json({ assets: [], nextCursor: null, degraded: true });
  }

  const sql = buildSemanticQuery({
    workspaceId,
    queryVec,
    limit: PAGE + 1,
    offset,
    fileType: fileType === 'PHOTO' || fileType === 'VIDEO' ? fileType : undefined,
    folderId,
    eventId,
    includeDistance: true,
  });

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await db.$queryRaw<Array<Record<string, unknown>>>(sql);
  } catch (err) {
    console.error('[api/dam/assets/semantic] db.$queryRaw failed:', err);
    return NextResponse.json({ error: 'Search unavailable' }, { status: 500 });
  }

  const hasMore = rows.length > PAGE;
  return NextResponse.json({
    assets: rows.slice(0, PAGE),
    nextCursor: hasMore ? String(offset + PAGE) : null,
  });
}
