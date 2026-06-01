/**
 * POST /api/intelligence/booth-link — mint a shared sponsor-booth QR link for an event + sponsor.
 * STAFF-gated, workspace-scoped. Node runtime.
 */
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { createBoothLink } from '@/lib/intelligence/activation';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const sponsorBrandId = typeof body?.sponsorBrandId === 'string' ? body.sponsorBrandId : '';
  if (!eventId || !sponsorBrandId) {
    return NextResponse.json({ error: 'eventId and sponsorBrandId are required' }, { status: 400 });
  }

  try {
    const { token, url } = await createBoothLink({ workspaceId, eventId, sponsorBrandId });
    return NextResponse.json({ ok: true, token, url });
  } catch (e) {
    console.error('[booth-link] creation failed:', e);
    return NextResponse.json({ error: 'Could not create booth link' }, { status: 500 });
  }
}
