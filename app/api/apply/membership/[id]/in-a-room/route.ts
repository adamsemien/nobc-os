import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { APPLY_DRAFT_COOKIE, verifyApplyDraftToken } from '@/lib/apply-draft-token';
import { isApplicationAccountOwner } from '@/lib/apply-account-link';
import { loadInARoomForApplication } from '@/lib/apply/inARoomOptions';

/**
 * In-A-Room questions + option point maps for the apply form (Apply Scoring v2,
 * Phase 4). Returns the DB `QuestionOption` ids the tap-grid / most-least
 * components must submit so the Phase-3 scorer can look them up.
 *
 * Authorized the SAME way as the draft GET/PATCH (draft cookie OR account owner),
 * replicated here rather than shared because `[id]/route.ts` is frozen this phase.
 * Returns only public question content (labels + option ids), never PII.
 */
const ID_RE = /^[a-z0-9_-]{8,40}$/i;

async function authorizeDraftAccess(req: NextRequest, id: string): Promise<boolean> {
  if (verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value)) return true;
  const { userId } = await auth();
  return isApplicationAccountOwner(id, userId);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!(await authorizeDraftAccess(req, id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  const inARoom = await loadInARoomForApplication(id);
  return NextResponse.json({ inARoom });
}
