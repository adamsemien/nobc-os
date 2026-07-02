/** Builder live preview (Stage 17, M3).
 *
 *  POST a draft spec -> { valid, errors, view }. Validates with the same
 *  validator PUT uses and projects through the same guest projector the
 *  public walkthrough renders - one projector, zero drift between what the
 *  operator previews and what a guest sees. Persists nothing.
 */
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import {
  getDefaultRegistry,
  projectGuestView,
  specToPreviewTree,
  validateGateSpec,
} from '@/lib/gate-engine';
import type { GateNodeSpec, GuestGateView } from '@/lib/gate-engine';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await requireWorkspaceId(userId);
  await params;

  let spec: GateNodeSpec;
  try {
    const body = (await req.json()) as { spec?: unknown };
    if (!body.spec || typeof body.spec !== 'object') throw new Error('missing spec');
    spec = body.spec as GateNodeSpec;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const registry = getDefaultRegistry();
  const result = validateGateSpec(spec, registry);
  if (!result.valid) {
    return NextResponse.json({ valid: false, errors: result.errors, view: null });
  }

  const view: GuestGateView = projectGuestView({
    tree: specToPreviewTree(spec),
    evaluation: null,
    proofs: new Map(),
    registry,
    needsIdentity: true,
  });
  return NextResponse.json({ valid: true, errors: [], view });
}
