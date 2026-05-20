import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `You are generating a QA testing mission for an operator of the No Bad Company platform.

The platform has these features:
- Applications review (approve / reject / hold / waitlist) at /operator/applications and /operator/applications/[id]
- Events (create / publish / cancel) at /operator/events, /operator/events/new, /operator/events/[id]
- Members (view / edit / comment) at /operator/members and /operator/members/[id]
- Check-in (live + walk-ins) at /check-in/[slug]
- The Room (live event dashboard) at /operator/events/[id]
- Workflow gates on events (apply_or_pay, members_only, open, ticketed, comp)
- Purple list / Blocked list management at /operator/settings/lists
- AI agent panel (Cmd+Option+A)
- Command palette (Cmd+K) — global search + quick actions
- Bulk actions on applications + members
- AI persona runner (dev toolbar)
- Intelligence dashboard at /operator/intelligence
- Audit log at /operator/audit

Generate ONE mission as valid JSON in this exact shape:
{
  "scenario": "one paragraph — set the scene, why this matters, what's at stake",
  "missionType": "speed_run" | "discovery" | "workflow" | "stress_test" | "bug_hunt",
  "difficulty": "easy" | "medium" | "hard",
  "steps": [
    {
      "id": "step-1",
      "instruction": "clear specific action the operator must take",
      "checkpoint": "URL pattern OR action descriptor that confirms completion (examples: 'visit:/operator/applications', 'visit:/operator/events/new', 'manual:approve at least 1 application', 'manual:add a comment')",
      "points": 10
    }
  ],
  "timeLimit": 120,
  "bonusObjective": "optional extra-credit objective phrased in one sentence"
}

Checkpoint syntax:
- "visit:<pathname>" — auto-completes when the operator navigates to that pathname (supports trailing wildcards via *, e.g. "visit:/operator/applications/*")
- "manual:<description>" — operator marks complete by hand when the action is done

Vary creativity. Mix obvious flows with edge cases. Examples of mission ideas:
- Speed: "Approve 3 applications, leave a comment on one, all in under 90 seconds"
- Discovery: "Find a member who lives in East Cesar Chavez using only the command palette"
- Workflow: "Create a ticketed event for next Friday with apply_or_pay workflow and 2 custom questions"
- Stress test: "Try to break the application form — submit malformed inputs, see what survives"
- Bug hunt: "Find one UI inconsistency anywhere in the operator dashboard. Document it via the bug button."

Make difficulty real. Easy = 3 steps, ~10pt each, no time pressure. Medium = 4-5 steps with one tricky one. Hard = 5-6 steps, often with a time limit and a bonus objective. Points per step: 10 (trivial), 20 (normal), 35 (tricky), 50 (genuinely hard).

Return ONLY the JSON object. No prose, no markdown fences.`;

type Difficulty = 'easy' | 'medium' | 'hard';

interface MissionStep {
  id: string;
  instruction: string;
  checkpoint: string;
  points: number;
}

interface GeneratedMission {
  scenario: string;
  missionType: string;
  difficulty: Difficulty;
  steps: MissionStep[];
  timeLimit?: number;
  bonusObjective?: string;
}

const VALID_TYPES = new Set(['speed_run', 'discovery', 'workflow', 'stress_test', 'bug_hunt']);
const VALID_DIFFICULTY = new Set(['easy', 'medium', 'hard']);

function isValidMission(m: unknown): m is GeneratedMission {
  if (!m || typeof m !== 'object') return false;
  const x = m as Record<string, unknown>;
  if (typeof x.scenario !== 'string' || !x.scenario.trim()) return false;
  if (typeof x.missionType !== 'string' || !VALID_TYPES.has(x.missionType)) return false;
  if (typeof x.difficulty !== 'string' || !VALID_DIFFICULTY.has(x.difficulty)) return false;
  if (!Array.isArray(x.steps) || x.steps.length === 0 || x.steps.length > 8) return false;
  for (const s of x.steps) {
    if (!s || typeof s !== 'object') return false;
    const step = s as Record<string, unknown>;
    if (typeof step.id !== 'string') return false;
    if (typeof step.instruction !== 'string') return false;
    if (typeof step.checkpoint !== 'string') return false;
    if (typeof step.points !== 'number' || step.points < 1 || step.points > 100) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  let difficulty: Difficulty = 'medium';
  try {
    const body = (await req.json()) as { difficulty?: Difficulty };
    if (body.difficulty && VALID_DIFFICULTY.has(body.difficulty)) difficulty = body.difficulty;
  } catch {}

  // Abandon any other active missions for this operator before starting fresh.
  await db.qAMission.updateMany({
    where: { workspaceId, operatorId: userId, status: 'active' },
    data: { status: 'abandoned', completedAt: new Date() },
  });

  const user = await currentUser();
  const operatorName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : (user?.username ?? user?.emailAddresses?.[0]?.emailAddress ?? 'Operator');

  let mission: GeneratedMission | null = null;
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-6'),
        system: SYSTEM_PROMPT,
        prompt: `Difficulty: ${difficulty}. Generate one mission now.`,
        maxOutputTokens: 1200,
        temperature: 0.9,
      });
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        lastError = 'AI returned non-JSON response';
        continue;
      }
      const parsed = JSON.parse(match[0]);
      if (!isValidMission(parsed)) {
        lastError = 'AI returned mission with invalid shape';
        continue;
      }
      mission = parsed;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'AI generation failed';
    }
  }

  if (!mission) {
    return NextResponse.json({ error: lastError || 'Mission generation failed' }, { status: 502 });
  }

  const created = await db.qAMission.create({
    data: {
      workspaceId,
      operatorId: userId,
      operatorName,
      scenario: mission.scenario,
      missionType: mission.missionType,
      difficulty: mission.difficulty,
      targetSteps: mission.steps as unknown as object,
    },
  });

  return NextResponse.json({
    mission: {
      id: created.id,
      scenario: created.scenario,
      missionType: created.missionType,
      difficulty: created.difficulty,
      steps: mission.steps,
      timeLimit: mission.timeLimit ?? null,
      bonusObjective: mission.bonusObjective ?? null,
      completedSteps: [],
      score: 0,
      bugsFound: [],
      status: created.status,
      startedAt: created.startedAt.toISOString(),
    },
  });
}
