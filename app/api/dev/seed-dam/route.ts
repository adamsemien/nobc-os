import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { cleanupSeededMedia, seedDam } from '@/lib/dam/seed';

const ALLOWED = (process.env.DEV_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Pexels download + Sharp processing for ~17 assets runs well past the default
// serverless timeout.
export const maxDuration = 300;

/** POST — seed dam-seed demo media (photos + videos) for the workspace. Idempotent. */
export async function POST() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = await requireWorkspaceId(userId);

  try {
    const result = await seedDam(db, workspaceId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('[seed-dam] seed failed', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Seed failed' },
      { status: 500 },
    );
  }
}

/** DELETE — remove all dam-seed demo media (assets + R2 objects + seed folders) for the workspace. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = await requireWorkspaceId(userId);
  const cleared = await cleanupSeededMedia(db, workspaceId);

  return NextResponse.json({
    success: true,
    deletedAssets: cleared.deletedAssets,
    deletedFolders: cleared.deletedFolders,
    freedBytes: cleared.freedBytes,
  });
}
