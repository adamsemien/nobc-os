import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

const CACHE_MS = 30 * 60 * 1000;

type CacheEntry = { vibe: string; expiresAt: number; mixKey: string };
const cache = new Map<string, CacheEntry>();

function mixKey(mix: Record<string, number>, checkedIn: number, capacity: number | null): string {
  const sorted = Object.entries(mix).sort(([a], [b]) => a.localeCompare(b));
  return `${checkedIn}/${capacity ?? '?'}|${sorted.map(([k, v]) => `${k}:${v}`).join(',')}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id: eventId } = await params;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true, capacity: true },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const checkedInRsvps = await db.rSVP.findMany({
    where: { workspaceId, eventId, checkedIn: true },
    select: { member: { select: { email: true } } },
  });
  const checkedIn = checkedInRsvps.length;

  if (checkedIn === 0) {
    return NextResponse.json({ vibe: 'doors not open yet' });
  }

  const emails = Array.from(
    new Set(checkedInRsvps.map(r => r.member.email.toLowerCase()).filter(Boolean)),
  );
  const apps = await db.application.findMany({
    where: {
      workspaceId,
      email: { in: emails, mode: 'insensitive' },
      archetype: { not: null },
    },
    select: { email: true, archetype: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const byEmail = new Map<string, string>();
  for (const a of apps) {
    const key = a.email.toLowerCase();
    if (!byEmail.has(key) && a.archetype) byEmail.set(key, a.archetype);
  }
  const mix: Record<string, number> = {};
  for (const email of emails) {
    const arch = byEmail.get(email);
    if (arch) mix[arch] = (mix[arch] ?? 0) + 1;
  }

  const key = `${workspaceId}:${eventId}`;
  const sig = mixKey(mix, checkedIn, event.capacity);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now && cached.mixKey === sig) {
    return NextResponse.json({ vibe: cached.vibe, cached: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ vibe: 'the room is filling' });
  }

  const capacityPct = event.capacity ? Math.round((checkedIn / event.capacity) * 100) : null;
  const mixDescription = Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  let vibe = 'the room is alive';
  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt: `You're reading the room at a No Bad Company event — a premium curated member club.

Current vibe:
- ${checkedIn} people checked in${event.capacity ? ` of ${event.capacity} capacity (${capacityPct}%)` : ''}
- Archetype mix: ${mixDescription || 'unknown'}

Give a 3-4 word read on the energy. Lowercase, no period, no quotes. Specific and evocative — not generic. Examples of tone: "founders and night owls", "creative energy building", "the room is full", "patrons hold court", "makers in deep talk".

Just the 3-4 words. Nothing else.`,
      maxOutputTokens: 30,
      temperature: 0.8,
    });
    vibe = text.trim().replace(/^["']|["']$/g, '').toLowerCase().slice(0, 60) || vibe;
  } catch (err) {
    console.error('[room/vibe] anthropic failed:', err);
  }

  cache.set(key, { vibe, expiresAt: now + CACHE_MS, mixKey: sig });
  return NextResponse.json({ vibe, cached: false });
}
