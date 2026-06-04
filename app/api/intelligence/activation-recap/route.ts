/**
 * POST /api/intelligence/activation-recap
 *
 * Generate an Activation Recap for a completed event (+ optional sponsor brand): compute the
 * numbers, persist a reproducible RecapSnapshot, render the editorial PDF, store it in private
 * R2, and mint a magic-link GeneratedAsset. STAFF-gated, workspace-scoped. Node runtime.
 */
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { generateAndStoreRecap } from '@/lib/intelligence/recap-delivery';

export const runtime = 'nodejs';
export const maxDuration = 120; // recap generation targets < 90s; allow headroom

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId, userId } = gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const asString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const asNonNegInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

  const eventId = asString(body.eventId);
  if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

  const sponsorBrandId = asString(body.sponsorBrandId) ?? null;
  const ownedImpressions = asNonNegInt(body.ownedImpressions);
  const earnedImpressions = asNonNegInt(body.earnedImpressions);
  const password = asString(body.password) ?? null;
  const deliverables = Array.isArray(body.deliverables)
    ? (body.deliverables as unknown[]).flatMap((d) => {
        if (d && typeof d === 'object') {
          const o = d as Record<string, unknown>;
          if (typeof o.label === 'string') {
            return [{ label: o.label, assetId: typeof o.assetId === 'string' ? o.assetId : undefined }];
          }
        }
        return [];
      })
    : undefined;

  try {
    const result = await generateAndStoreRecap({
      workspaceId,
      eventId,
      sponsorBrandId,
      ownedImpressions,
      earnedImpressions,
      deliverables,
      password,
      generatedBySession: userId,
    });
    return NextResponse.json({
      ok: true,
      url: result.url,
      token: result.token,
      generatedAssetId: result.generatedAssetId,
      snapshotId: result.snapshotId,
      storageConfigured: result.storageConfigured,
    });
  } catch (e) {
    console.error('[activation-recap] generation failed:', e);
    return NextResponse.json({ error: 'Recap generation failed' }, { status: 500 });
  }
}
