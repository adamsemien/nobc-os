import { db } from '@/lib/db';

/**
 * Network-capital score: how much downstream membership a member generates
 * through referrals, weighted by referred-member quality (application aiScore,
 * 0–100 scale) and their event engagement (totalEventsAttended).
 *
 * Returns null when the member has fewer than 2 referrals (too little signal).
 * Otherwise persists the result to Member.networkCapitalScore and returns it.
 */
export async function computeNetworkCapitalScore(memberId: string): Promise<number | null> {
  const referrals = await db.member.findMany({
    where: { referredByMemberId: memberId },
    select: { id: true, totalEventsAttended: true },
  });

  if (referrals.length < 2) return null;

  // aiScore lives on Application; there is no Prisma relation to Member, so we
  // fetch the referred members' applications by memberId.
  const apps = await db.application.findMany({
    where: { memberId: { in: referrals.map((r) => r.id) }, aiScore: { not: null } },
    select: { aiScore: true },
  });

  const count = referrals.length;
  const avgAiScore =
    apps.length > 0 ? apps.reduce((sum, a) => sum + (a.aiScore ?? 0), 0) / apps.length : 0;
  const avgTotalEventsAttended =
    referrals.reduce((sum, r) => sum + r.totalEventsAttended, 0) / count;

  const rawScore = count * (avgAiScore / 10) * (1 + avgTotalEventsAttended * 0.2);

  // Normalize to 0–10, cap, round to 1 decimal.
  const score = Math.round(Math.min(10, Math.max(0, rawScore)) * 10) / 10;

  await db.member.update({
    where: { id: memberId },
    data: { networkCapitalScore: score },
  });

  return score;
}

/**
 * Recompute network-capital scores for every member in a workspace, in batches
 * of 10 to bound DB concurrency.
 */
export async function refreshAllNetworkCapitalScores(workspaceId: string): Promise<void> {
  const members = await db.member.findMany({
    where: { workspaceId },
    select: { id: true },
  });

  const BATCH_SIZE = 10;
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((m) => computeNetworkCapitalScore(m.id)));
  }
}
