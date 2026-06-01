/**
 * POST /api/intelligence/audience-brief — generate a pre-sale Audience Intelligence Brief.
 *
 * Body: { sponsorBrandId?, password? }. With no sponsorBrandId, uses the workspace's first
 * sponsor brand (the common single-sponsor case). Renders the editorial brief PDF → R2 → magic
 * link. STAFF-gated, workspace-scoped. Node runtime.
 */
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { generateAndStoreBrief } from '@/lib/intelligence/recap-delivery';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId, userId } = gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  let sponsorBrandId = typeof body?.sponsorBrandId === 'string' && body.sponsorBrandId.trim() ? body.sponsorBrandId.trim() : '';
  const password = typeof body?.password === 'string' && body.password.trim() ? body.password.trim() : null;

  if (!sponsorBrandId) {
    const first = await db.sponsorBrandProfile.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!first) return NextResponse.json({ error: 'Create a sponsor brand first.' }, { status: 400 });
    sponsorBrandId = first.id;
  } else {
    const exists = await db.sponsorBrandProfile.findFirst({ where: { id: sponsorBrandId, workspaceId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'Sponsor not found in this workspace.' }, { status: 404 });
  }

  try {
    const r = await generateAndStoreBrief({ workspaceId, sponsorBrandId, password, generatedBySession: userId });
    return NextResponse.json({ ok: true, url: r.url, token: r.token, generatedAssetId: r.generatedAssetId, storageConfigured: r.storageConfigured });
  } catch (e) {
    console.error('[audience-brief] generation failed:', e);
    return NextResponse.json({ error: 'Brief generation failed' }, { status: 500 });
  }
}
