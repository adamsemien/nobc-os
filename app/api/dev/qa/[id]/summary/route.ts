import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type Severity = 'low' | 'medium' | 'high';

interface TargetStep {
  id: string;
  instruction: string;
  checkpoint: string;
  points: number;
}

interface CompletedStep {
  id: string;
  pointsAwarded: number;
  source: 'auto' | 'manual';
  evidence?: string;
}

interface BugReport {
  id: string;
  description: string;
  location: string;
  reportedAt: string;
  stepIndex?: number | null;
  stepTitle?: string | null;
  severity?: Severity;
  screenshotDataUrl?: string;
}

function severityLabel(s?: Severity): string {
  if (s === 'high') return 'High';
  if (s === 'low') return 'Low';
  return 'Medium';
}

function buildMarkdown(args: {
  title: string;
  completedAt: string;
  stepsPassed: number;
  stepsTotal: number;
  bugs: BugReport[];
  passingSteps: TargetStep[];
  skippedStepIds: Set<string>;
  fixes: string | null;
}): string {
  const { title, completedAt, stepsPassed, stepsTotal, bugs, passingSteps, skippedStepIds, fixes } = args;
  const lines: string[] = [];
  lines.push(`## QA Mission Summary — ${title}`);
  lines.push(`Completed: ${completedAt}`);
  lines.push(`Steps: ${stepsPassed}/${stepsTotal} passed | Bugs: ${bugs.length} found`);
  lines.push('');
  lines.push('### Bugs Found');
  if (bugs.length === 0) {
    lines.push('✓ No bugs reported');
  } else {
    bugs.forEach((b, i) => {
      const stepLabel =
        typeof b.stepIndex === 'number' && b.stepTitle
          ? `Step ${b.stepIndex + 1}: ${b.stepTitle}`
          : 'General';
      lines.push(`**Bug #${i + 1}** — ${stepLabel} [${severityLabel(b.severity)}]`);
      lines.push(`User reported: "${b.description}"`);
      if (b.location && b.location !== 'unknown') {
        lines.push(`Location: \`${b.location}\``);
      }
      if (b.screenshotDataUrl) {
        lines.push('[Screenshot attached — see panel]');
      }
      lines.push('');
    });
  }
  lines.push('### Passing Steps');
  if (passingSteps.length === 0) {
    lines.push('_(none)_');
  } else {
    passingSteps.forEach((s, i) => {
      const skipped = skippedStepIds.has(s.id);
      lines.push(`${skipped ? '↷' : '✓'} Step ${i + 1}: ${s.instruction}${skipped ? ' _(skipped)_' : ''}`);
    });
  }
  lines.push('');
  lines.push('### Recommended Fixes');
  lines.push(fixes ?? '_(no fixes generated)_');
  return lines.join('\n');
}

async function generateFixes(args: {
  scenario: string;
  bugs: BugReport[];
  steps: TargetStep[];
}): Promise<string | null> {
  if (args.bugs.length === 0) {
    return 'No bugs were reported in this mission — nothing to fix.';
  }
  const bugLines = args.bugs
    .map((b, i) => {
      const stepLabel =
        typeof b.stepIndex === 'number' && b.stepTitle
          ? `Step ${b.stepIndex + 1}: ${b.stepTitle}`
          : 'General';
      return `${i + 1}. [${severityLabel(b.severity)}] ${stepLabel} — ${b.description}${
        b.location && b.location !== 'unknown' ? ` (at ${b.location})` : ''
      }`;
    })
    .join('\n');

  const prompt = `You are reviewing QA bugs reported during a manual testing mission on the NoBC OS platform (Next.js 15, App Router, Prisma + Postgres, Clerk auth, multi-tenant member club software).

Mission scenario:
${args.scenario}

Bugs reported:
${bugLines}

For each bug, give one short prioritized fix recommendation. Be specific:
- Reference likely file paths or component names where a NoBC OS developer would start (e.g. \`app/operator/applications/[id]\`, \`lib/scoring.ts\`).
- Lead with the highest-severity items first.
- Keep each fix to 1-3 sentences. No preamble, no caveats.
- Use markdown numbered list. Bold the file path or component name.

Output only the numbered list. Do not add a heading.`;

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      prompt,
      maxOutputTokens: 800,
      temperature: 0.3,
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const mission = await db.qAMission.findFirst({
    where: { id, workspaceId },
  });
  if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 });

  const steps = (mission.targetSteps as unknown as TargetStep[]) ?? [];
  const completed = (mission.completedSteps as unknown as CompletedStep[]) ?? [];
  const bugs = (mission.bugsFound as unknown as BugReport[]) ?? [];

  const completedIds = new Set(completed.map((c) => c.id));
  const skippedIds = new Set(completed.filter((c) => c.evidence === 'skipped').map((c) => c.id));
  const passingSteps = steps.filter((s) => completedIds.has(s.id));

  const titleSource = mission.scenario.split('\n')[0] || 'Untitled mission';
  const title =
    titleSource.length > 80 ? titleSource.slice(0, 77).trimEnd() + '…' : titleSource;

  const fixes = await generateFixes({ scenario: mission.scenario, bugs, steps });

  const completedAt = (mission.completedAt ?? new Date()).toISOString();

  const markdown = buildMarkdown({
    title,
    completedAt,
    stepsPassed: passingSteps.length,
    stepsTotal: steps.length,
    bugs,
    passingSteps,
    skippedStepIds: skippedIds,
    fixes,
  });

  return NextResponse.json({
    markdown,
    fixes,
    title,
    bugs,
    stepsPassed: passingSteps.length,
    stepsTotal: steps.length,
  });
}
