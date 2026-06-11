import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { generateEventPass, isPassNinjaConfigured } from '@/lib/wallet-pass';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ rsvpId: string }> },
) {
  if (!isPassNinjaConfigured()) {
    return NextResponse.json({ error: 'Wallet passes not configured' }, { status: 503 });
  }

  const { rsvpId } = await params;

  // Clerk session only — mirrors the Google wallet route. (A prior base64
  // `rsvpId:workspaceId` token param was removed: it was unsigned/forgeable and
  // nothing in the codebase ever minted one, so it was dead, exploitable auth.)
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch RSVP workspace-scoped
  const rsvp = await db.rSVP.findUnique({
    where: { id: rsvpId },
    select: { id: true, workspaceId: true, memberId: true },
  });

  if (!rsvp || rsvp.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await generateEventPass(rsvpId);
    if (!result) {
      return NextResponse.json({ error: 'Pass generation failed' }, { status: 500 });
    }

    // Log audit event
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'wallet.apple_pass_created',
        entityType: 'RSVP',
        entityId: rsvpId,
        metadata: { passNinjaId: result.passNinjaId },
      },
    });

    // If the SDK returns a URL rather than raw bytes, redirect to it
    // (PassNinja serves .pkpass files via CDN URL)
    if (result.passUrl) {
      return NextResponse.redirect(result.passUrl, 302);
    }

    return NextResponse.json({ error: 'Pass URL unavailable' }, { status: 500 });
  } catch (err) {
    console.error('[wallet/apple] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
