/**
 * GET /api/media/dam/asset/[id]/similar — "more like this" via stored CLIP embedding.
 *
 * Finds the nearest-neighbor assets to the source asset using the HNSW cosine
 * index (Asset_embedding_hnsw_idx). Uses a SQL subselect to avoid round-tripping
 * the 768 floats through JS — the subselect reads the source embedding directly
 * from Postgres. Both the outer query and subselect are workspace-scoped.
 *
 * Returns { assets: [] } (empty, not 404) when the source asset has no embedding
 * yet, so the UI can degrade gracefully.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { buildSimilarQuery } from '@/lib/dam/semantic';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const { id } = await ctx.params;

  // Verify the source asset exists in this workspace and has an embedding.
  // We check embedding existence here to return an early empty result rather than
  // letting the SQL subselect silently return an empty ORDER BY (all rows at
  // equal distance zero from a NULL vector).
  const source = await db.$queryRaw<Array<{ hasEmbedding: boolean }>>`
    SELECT ("embedding" IS NOT NULL) AS "hasEmbedding"
    FROM "Asset"
    WHERE "id" = ${id}
      AND "workspaceId" = ${workspaceId}
      AND "deletedAt" IS NULL
    LIMIT 1
  `;

  if (!source.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!source[0].hasEmbedding) {
    return NextResponse.json({ assets: [] });
  }

  const sql = buildSimilarQuery({ workspaceId, sourceAssetId: id });

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await db.$queryRaw<Array<Record<string, unknown>>>(sql);
  } catch (err) {
    console.error(`[api/dam/asset/${id}/similar] db.$queryRaw failed:`, err);
    return NextResponse.json({ error: 'Search unavailable' }, { status: 500 });
  }

  return NextResponse.json({ assets: rows });
}
