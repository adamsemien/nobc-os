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

/** Hard ceiling on the Claude call. Client also enforces its own timeout (slightly higher).
 *  3s was too tight in practice — Sonnet often takes 2.5–3.5s on this prompt and the abort
 *  raced the response. 4s gives Sonnet headroom while still satisfying the spec's "non-blocking"
 *  intent (user sees Pass advance within ~4s worst case). */
const JUDGE_TIMEOUT_MS = 4000;

/** Extract the first balanced top-level JSON object in a string.
 *  Safer than non-greedy regex when Claude returns nested objects or
 *  wraps the JSON in markdown fences. Returns null if nothing parses. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

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
  console.log('[qa/judge] POST', { userId, hasAllowlist: ALLOWED.length > 0 });
  if (!userId || !ALLOWED.includes(userId)) {
    console.warn('[qa/judge] forbidden', { userId, allowedCount: ALLOWED.length });
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
  console.log('[qa/judge] judging step', {
    instruction: instruction.slice(0, 80),
    trailLength: trail.length,
  });

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
        maxOutputTokens: 120,
        temperature: 0.2,
      }),
      JUDGE_TIMEOUT_MS,
    );
    const jsonStr = extractFirstJsonObject(text);
    if (!jsonStr) {
      console.warn('[qa/judge] no JSON object in Claude response', { rawText: text.slice(0, 300) });
      return NextResponse.json({ verdict: null, reason: null });
    }
    let parsed: { verdict?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(jsonStr) as { verdict?: unknown; reason?: unknown };
    } catch (e) {
      console.warn('[qa/judge] JSON.parse failed', {
        error: e instanceof Error ? e.message : String(e),
        candidate: jsonStr.slice(0, 300),
        rawText: text.slice(0, 300),
      });
      return NextResponse.json({ verdict: null, reason: null });
    }
    const verdict: Verdict | null =
      typeof parsed.verdict === 'string' && VALID_VERDICTS.has(parsed.verdict as Verdict)
        ? (parsed.verdict as Verdict)
        : null;
    const reason =
      typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200).trim() : null;
    console.log('[qa/judge] verdict', { verdict, hasReason: !!reason });
    return NextResponse.json({ verdict, reason });
  } catch (e) {
    console.warn('[qa/judge] generation failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ verdict: null, reason: null });
  }
}
