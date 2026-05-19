import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { scoreApplication } from '@/lib/scoring';
import { PERSONA_TEST_TAG, type Persona } from '@/lib/dev/persona-types';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `Generate realistic test personas for a curated member club in Austin TX called No Bad Company. The application asks about work, what they're building, neighborhood, brands they care about, why they want to join, what they bring. Return ONLY valid JSON matching this schema: { fullName, email (use [firstname].[lastname]+test@example.com), phone (512 or 737), city: 'Austin, TX', neighborhood (real Austin neighborhood), homeAddress, whereFrom, birthday (YYYY-MM-DD, age 25-45), workWebsite, referredBy, whatYouDo (2-3 sentences in their voice), passionProjects, brandsYouLove (4-6 real brands matching persona), whyNobc, contribution, rapidFire: { sundayMorning, karaokeOrder, ifNotHere }, archetype_lean (Connector/Host/Curator/Builder/Maker/Patron) }. Vary writing style, depth, demographics, work types. 30% borderline candidates.`;

async function generateOne(): Promise<Persona | null> {
  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      prompt: 'Generate one new persona, distinct from any previous output.',
      maxOutputTokens: 1024,
      temperature: 1.0,
    });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Persona;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  const t0 = Date.now();
  const created: string[] = [];
  let aiFailures = 0;

  // Spread createdAt across the past 6 months.
  const now = Date.now();
  const sixMonthsMs = 6 * 30 * 86_400_000;

  for (let i = 0; i < 50; i++) {
    const persona = await generateOne();
    if (!persona) {
      aiFailures++;
      continue;
    }
    const offset = Math.floor(((i + 0.5) / 50) * sixMonthsMs);
    const createdAt = new Date(now - sixMonthsMs + offset);

    // Insert application
    const app = await db.application.create({
      data: {
        workspaceId,
        fullName: persona.fullName,
        email: `${persona.email.toLowerCase()}.batch${i}@example.com`,
        phone: persona.phone ?? null,
        city: persona.city ?? null,
        neighborhood: persona.neighborhood ?? null,
        referredBy: persona.referredBy ?? null,
        consentEmail: true,
        consentSms: false,
        createdAt,
        aiTags: [PERSONA_TEST_TAG],
      },
    });
    const answers: Record<string, string> = {
      work_website: persona.workWebsite ?? '',
      what_you_do: persona.whatYouDo ?? '',
      passion_projects: persona.passionProjects ?? '',
      brands_you_love: persona.brandsYouLove ?? '',
      why_nobc: persona.whyNobc ?? '',
      contribution: persona.contribution ?? '',
    };
    await Promise.all(
      Object.entries(answers).map(([k, v]) =>
        db.applicationAnswer.create({ data: { applicationId: app.id, questionKey: k, answer: v } }),
      ),
    );

    // Best-effort AI scoring. Continue on failure.
    try { await scoreApplication(app.id); } catch { /* ignore */ }

    created.push(app.id);
  }

  // Distribute statuses: 25 PENDING (default already), 10 ON_HOLD, 10 APPROVED, 5 REJECTED.
  // ApplicationStatus uses: PENDING, APPROVED, REJECTED, HOLD (no ON_HOLD), WAITLISTED, DECLINED.
  const shuffled = [...created].sort(() => Math.random() - 0.5);
  const onHold = shuffled.slice(0, 10);
  const approved = shuffled.slice(10, 20);
  const rejected = shuffled.slice(20, 25);

  await db.application.updateMany({ where: { id: { in: onHold } }, data: { status: 'HOLD' } });
  await db.application.updateMany({ where: { id: { in: rejected } }, data: { status: 'REJECTED', reviewedAt: new Date() } });

  // Approve: create matching Member rows.
  for (const id of approved) {
    const app = await db.application.findUnique({ where: { id } });
    if (!app) continue;
    const parts = app.fullName.trim().split(' ');
    const member = await db.member.upsert({
      where: { workspaceId_email: { workspaceId, email: app.email } },
      update: { status: 'APPROVED', approved: true, approvedAt: new Date() },
      create: {
        workspaceId,
        clerkUserId: `app_${app.id}`,
        email: app.email,
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        phone: app.phone ?? undefined,
        status: 'APPROVED',
        approved: true,
        approvedAt: new Date(),
      },
    });
    await db.application.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date(), memberId: member.id },
    });
  }

  return NextResponse.json({
    ok: true,
    totalMs: Date.now() - t0,
    created: created.length,
    aiFailures,
    statusDistribution: {
      pending: 25,
      hold: 10,
      approved: approved.length,
      rejected: rejected.length,
    },
  });
}
