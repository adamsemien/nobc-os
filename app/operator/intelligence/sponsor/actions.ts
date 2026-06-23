'use server';

import { unstable_cache, revalidateTag } from 'next/cache';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '@/lib/db';

// MODEL NOTE: claude-haiku-4-5-20251001 is used here for this sponsor-narrative
// feature (cheap, high-level editorial summarization) - the MECHANICAL_MODEL tier
// (lib/ai/runtime-models.ts). Kept inline; per CLAUDE.md > Locked Decisions,
// model bumps and tier moves are Adam's call.
const NARRATIVE_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT =
  'You are an audience intelligence analyst writing sponsor briefing materials for an invite-only community in Austin, TX called No Bad Company. Write in a confident, editorial voice — like a luxury brand strategist, not a data analyst. Never mention individual names. Write the narrative directly without preamble.';

function topN(values: (string | null | undefined)[], n: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Assemble the compact signal block fed to the model. All workspace-scoped. */
async function collectSignals(workspaceId: string): Promise<string> {
  const [recentApps, approvedApps, members] = await Promise.all([
    db.application.findMany({
      where: { workspaceId, status: 'APPROVED' },
      orderBy: { reviewedAt: 'desc' },
      take: 20,
      select: { aiReasoning: true, aiTags: true, aiScore: true },
    }),
    db.application.findMany({
      where: { workspaceId, status: 'APPROVED' },
      select: { aiTags: true },
    }),
    db.member.findMany({
      where: { workspaceId, status: 'APPROVED', mergedIntoId: null },
      select: { industry: true, jobFunction: true },
    }),
  ]);

  const topTags = topN(approvedApps.flatMap((a) => a.aiTags), 8);
  const topIndustries = topN(members.map((m) => m.industry), 5);
  const topJobs = topN(members.map((m) => m.jobFunction), 5);
  const reasoning = recentApps
    .map((a) => a.aiReasoning?.slice(0, 180))
    .filter((r): r is string => !!r);

  return [
    `Approved audience size: ${members.length}.`,
    `Top member tags: ${topTags.map((t) => t.value).join(', ') || 'n/a'}.`,
    `Top industries: ${topIndustries.map((t) => `${t.value} (${t.count})`).join(', ') || 'n/a'}.`,
    `Top job functions: ${topJobs.map((t) => t.value).join(', ') || 'n/a'}.`,
    `Recent member reasoning excerpts: ${reasoning.join(' | ') || 'n/a'}`,
  ].join('\n');
}

/** Run the model. Throws on AI failure so a transient error is not cached. */
async function synthesize(workspaceId: string): Promise<string> {
  const signals = await collectSignals(workspaceId);
  if (!process.env.ANTHROPIC_API_KEY) return '';

  const { text } = await generateText({
    model: anthropic(NARRATIVE_MODEL),
    system: SYSTEM_PROMPT,
    prompt:
      'Write a 3-sentence sponsor alignment narrative for this audience. Be specific and concrete about what makes this community distinctive and valuable to a brand partner. ' +
      `Signals:\n${signals}\n\nWrite only the 3 sentences.`,
  });
  return text.trim();
}

/** Cached read (1h). Used by the server page for the initial render. */
export async function getAudienceNarrative(workspaceId: string): Promise<string> {
  const cached = unstable_cache(() => synthesize(workspaceId), ['audience-narrative', workspaceId], {
    revalidate: 3600,
    tags: [`audience-narrative-${workspaceId}`],
  });
  return cached();
}

/** Regenerate — invalidates the cache and returns a fresh narrative. */
export async function regenerateAudienceNarrative(workspaceId: string): Promise<string> {
  revalidateTag(`audience-narrative-${workspaceId}`);
  return synthesize(workspaceId);
}
