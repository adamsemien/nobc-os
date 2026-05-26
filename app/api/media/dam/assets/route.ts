/**
 * GET /api/media/dam/assets — workspace-scoped asset list for the operator grid.
 * Filter / sort / Postgres FTS / cursor pagination. READ_ONLY+ may read. No signed
 * URLs in the payload (thumbnails load via /api/media/dam/asset/[id]/thumb).
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { ASSET_SORTS, buildAssetWhere, parseAssetQuery } from '@/lib/dam/search';

export const runtime = 'nodejs';
const PAGE = 60;

export async function GET(req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const p = parseAssetQuery(req.nextUrl.searchParams);

  // Event titles aren't in the asset search vector (eventId is a plain string),
  // so resolve matching event ids separately and union them into the FTS clause.
  let matchingEventIds: string[] = [];
  if (p.q) {
    const events = await db.event.findMany({
      where: { workspaceId, title: { contains: p.q, mode: 'insensitive' } },
      select: { id: true },
      take: 200,
    });
    matchingEventIds = events.map((e) => e.id);
  }

  const where = buildAssetWhere(workspaceId, p, matchingEventIds);
  const order = ASSET_SORTS[p.sort];
  const offset = p.cursor ? Math.max(0, parseInt(p.cursor, 10) || 0) : 0;

  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT "id", "filename", "blurhash", "width", "height", "fileType", "isSelect",
           "shootDate", "sponsorName", "eventId", "tags", "aiTags", "qualityScore", "createdAt",
           "size", "shooterCredit"
    FROM "Asset"
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${PAGE + 1} OFFSET ${offset}
  `);

  const hasMore = rows.length > PAGE;
  return NextResponse.json({
    assets: rows.slice(0, PAGE),
    nextCursor: hasMore ? String(offset + PAGE) : null,
  });
}
