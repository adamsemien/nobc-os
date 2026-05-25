import { OperatorRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

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
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

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
