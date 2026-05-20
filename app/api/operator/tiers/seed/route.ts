import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

/**
 * Seed sensible default tiers for a member club. Idempotent — only seeds
 * when the workspace currently has zero active tiers.
 *
 * Mapping mirrors the legacy 'low'/'mid'/'top' bucket thresholds so that the
 * dropdown behaves identically on first use until the operator customizes.
 */
const DEFAULT_TIERS: { name: string; order: number; minScore: number | null }[] = [
  { name: 'Considering', order: 0, minScore: null },
  { name: 'Member', order: 1, minScore: 0.53 },
  { name: 'Resident', order: 2, minScore: 0.73 },
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const existing = await db.membershipTier.count({
    where: { workspaceId, deletedAt: null },
  });
  if (existing > 0) {
    return NextResponse.json(
      { error: 'Workspace already has tiers configured.' },
      { status: 409 },
    );
  }

  await db.$transaction(
    DEFAULT_TIERS.map((t) =>
      db.membershipTier.create({ data: { workspaceId, ...t } }),
    ),
  );

  const tiers = await db.membershipTier.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { order: 'asc' },
  });
  return NextResponse.json({ tiers });
}
