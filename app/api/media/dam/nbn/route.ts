/**
 * GET /api/media/dam/nbn — read-only DAM search for the NBN Builder.
 *
 * NOT Clerk-gated: authenticated machine-to-machine via a bearer token
 * (`NBN_DAM_READ_TOKEN` env var) so the builder's Netlify function can call it
 * headlessly. Fails closed when the token env var is unset. Photos only.
 *
 * Returns permanent public-link hotlink URLs (`/i/[token]?w=…`) — the exact
 * email-safe egress the DAM already mints for newsletters. Raw R2 keys and
 * signed URLs never leave this route.
 *
 * STAGED BY CLAUDE 2026-07-17 — Adam reviews and deploys; never auto-deployed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { buildAssetWhere, parseAssetQuery } from '@/lib/dam/search';
import { isPublicLinkConfigured, mintPublicAssetToken } from '@/lib/dam/public-link';

export const runtime = 'nodejs';

const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 24;

function authorized(req: NextRequest): boolean {
  const expected = process.env.NBN_DAM_READ_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!process.env.NBN_DAM_READ_TOKEN) {
    return NextResponse.json({ error: 'NBN DAM access not configured (NBN_DAM_READ_TOKEN unset).' }, { status: 501 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isPublicLinkConfigured()) {
    return NextResponse.json({ error: 'Public links not configured (DAM_PUBLIC_LINK_SECRET unset).' }, { status: 501 });
  }

  // Workspace: explicit env pin, else the sole workspace (this is a
  // single-workspace install; fail loudly if that ever changes).
  let workspaceId = process.env.NBN_DAM_WORKSPACE_ID || '';
  if (!workspaceId) {
    const workspaces = await db.workspace.findMany({ select: { id: true }, take: 2 });
    if (workspaces.length !== 1) {
      return NextResponse.json({ error: 'Multiple workspaces — set NBN_DAM_WORKSPACE_ID.' }, { status: 501 });
    }
    workspaceId = workspaces[0].id;
  }

  const p = parseAssetQuery(req.nextUrl.searchParams);
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const where = buildAssetWhere(workspaceId, p, []);

  const rows = await db.$queryRaw<
    Array<{ id: string; filename: string | null; width: number | null; height: number | null; tags: string[]; aiTags: string[] }>
  >(Prisma.sql`
    SELECT "id", "filename", "width", "height", "tags", "aiTags"
    FROM "Asset"
    WHERE ${where} AND "fileType" = 'PHOTO'
    ORDER BY "shootDate" DESC NULLS LAST, "createdAt" DESC
    LIMIT ${limit}
  `);

  const origin = req.nextUrl.origin;
  const assets = rows.flatMap((r) => {
    const token = mintPublicAssetToken({ workspaceId, assetId: r.id });
    if (!token) return [];
    return [{
      id: r.id,
      url: `${origin}/i/${token}?w=1200`,
      thumbUrl: `${origin}/i/${token}?w=400`,
      filename: r.filename,
      width: r.width,
      height: r.height,
      tags: [...new Set([...(r.tags || []), ...(r.aiTags || [])])].slice(0, 12),
    }];
  });

  return NextResponse.json({ assets });
}
