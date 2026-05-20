import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type Verdict = 'pass' | 'partial' | 'fail';
const VALID_VERDICTS = new Set<Verdict>(['pass', 'partial', 'fail']);

interface ActionEntry {
  timestamp: number;
  type: 'navigate' | 'action';
  label: string;
  url?: string;
}

/** Hard ceiling on the Claude call. Client also enforces its own timeout. */
const JUDGE_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('judge timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function formatTrail(trail: ActionEntry[]): string {
  if (!Array.isArray(trail) || trail.length === 0) return '(no actions recorded)';
  return trail
    .map((e, i) => {
      const safe = String(e.label ?? '').slice(0, 140);
      if (e.type === 'navigate') return `${i + 1}. Navigated to ${safe}`;
      return `${i + 1}. Action: ${safe}`;
    })
    .join('\n');
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { stepInstruction?: string; actionTrail?: ActionEntry[] } = {};
  try {
    body = await req.json();
  } catch {}

  const instruction =
    typeof body.stepInstruction === 'string' ? body.stepInstruction.slice(0, 800).trim() : '';
  if (!instruction) {
    return NextResponse.json({ error: 'stepInstruction required' }, { status: 400 });
  }
  const trail = Array.isArray(body.actionTrail) ? body.actionTrail.slice(0, 30) : [];
  const trailText = formatTrail(trail);

  const prompt = `You are a QA judge for a web app. The tester was given this instruction:
"${instruction}"

Here is what they did:
${trailText}

Respond with JSON only:
{
  "verdict": "pass" | "partial" | "fail",
  "reason": "one sentence, max 12 words, specific to what they did or missed"
}

pass = completed the instruction correctly
partial = attempted it but missed something or did extra steps
fail = did something unrelated or navigated away without completing it`;

  try {
    const { text } = await withTimeout(
      generateText({
        model: anthropic('claude-sonnet-4-6'),
        prompt,
        maxOutputTokens: 100,
        temperature: 0.2,
      }),
      JUDGE_TIMEOUT_MS,
    );
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return NextResponse.json({ verdict: null, reason: null });
    const parsed = JSON.parse(match[0]) as { verdict?: unknown; reason?: unknown };
    const verdict: Verdict | null =
      typeof parsed.verdict === 'string' && VALID_VERDICTS.has(parsed.verdict as Verdict)
        ? (parsed.verdict as Verdict)
        : null;
    const reason =
      typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200).trim() : null;
    return NextResponse.json({ verdict, reason });
  } catch {
    return NextResponse.json({ verdict: null, reason: null });
  }
}
