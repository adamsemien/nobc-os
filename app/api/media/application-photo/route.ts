/**
 * GET /api/media/application-photo?key=<r2-key> — stable, private read URL for a
 * membership-application portrait. Mirrors the DAM thumb route: role-gates the
 * caller, confirms the key belongs to their workspace (IDOR guard), then
 * 302-redirects to a short-lived signed R2 URL. The objects stay private and
 * the signature never appears in JSON or outlives a render session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { DISPLAY_URL_TTL, presignGet } from '@/lib/dam/storage';
import { isWorkspacePhotoKey } from '@/lib/apply-photo';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await requireRole(OperatorRole.READ_ONLY);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const key = req.nextUrl.searchParams.get('key')?.trim() ?? '';
  if (!key || !isWorkspacePhotoKey(key, workspaceId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = await presignGet(key, DISPLAY_URL_TTL);
  if (!url) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });

  // Cache the redirect for a single render session, well under the signed TTL.
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=600' },
  });
}
