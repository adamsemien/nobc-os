import { NextRequest, NextResponse, after } from 'next/server';
import { render } from '@react-email/render';
import { db } from '@/lib/db';
import { resend } from '@/lib/resend';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { scoreApplication } from '@/lib/scoring';
import { checkDuplicate, checkWatchList } from '@/lib/watchlist';
import { resolveMember, promoteMemberToApproved } from '@/lib/member-identity';
import { maybeFireSlack } from '@/lib/comments-notify';
import { backupApplication } from '@/lib/applications/backup';
import { publicRateLimit } from '@/lib/public-rate-limit';
import WelcomeEmail from '@/emails/WelcomeEmail';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Abuse protection: cap submit floods before any DB / Anthropic / Resend work.
  // Each submit fans out to two Sonnet calls + an email, so an unthrottled flood
  // is unbounded AI cost. In-memory per-IP limiter (resets on cold start) — see
  // the FLAG in the hardening report: production-grade distributed limiting needs
  // a shared store (Upstash/Vercel WAF). The idempotency guard below compounds it.
  const rateCheck = publicRateLimit(req);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSecs) } },
    );
  }

  const { id } = await params;

  const application = await db.application.findUnique({
    where: { id },
    include: { answers: true },
  });
  if (!application) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // ── 0. Idempotency guard ──────────────────────────────────────────────
  // A double-tap, network retry, or script replay must not re-run scoring (two
  // billed Sonnet calls) or re-send the welcome email. Once an application has
  // been scored (aiScore set) we return the persisted reveal shape unchanged —
  // the client only reads archetype / archetypeScores / tags / personalizedCopy,
  // all of which are durably stored on the row.
  if (application.aiScore !== null) {
    return NextResponse.json({
      cached: true,
      archetype: application.archetype ?? '',
      archetypeScores: (application.archetypeScores ?? {}) as Record<string, number>,
      tags: application.aiTags,
      personalizedCopy: application.personalizedCopy ?? '',
    });
  }
  // A terminal status with no score means the BLOCKED auto-reject path already
  // ran (BLOCKED short-circuits before scoring). Replaying it must stay a no-op.
  if (application.status === 'REJECTED') {
    return NextResponse.json({ blocked: true, cached: true });
  }

  // ── 1. Duplicate check ────────────────────────────────────────────────
  const isDuplicate = await checkDuplicate(
    application.workspaceId,
    application.email,
    application.phone,
    application.id,
  );
  if (isDuplicate) {
    await db.auditEvent.create({
      data: {
        workspaceId: application.workspaceId,
        actorType: 'SYSTEM',
        action: 'application.duplicate_blocked',
        entityType: 'Application',
        entityId: application.id,
      },
    });
    return NextResponse.json({ error: 'duplicate_application' }, { status: 409 });
  }

  // ── 2 + 3. WatchList check ────────────────────────────────────────────
  const watchMatch = await checkWatchList(
    application.workspaceId,
    application.email,
    application.phone,
    null, // Instagram not yet captured as an explicit form field
  );

  if (watchMatch?.type === 'BLOCKED') {
    await db.application.update({ where: { id }, data: { status: 'REJECTED' } });
    await db.auditEvent.create({
      data: {
        workspaceId: application.workspaceId,
        actorType: 'SYSTEM',
        action: 'application.blocked',
        entityType: 'Application',
        entityId: application.id,
        metadata: { watchListEntryId: watchMatch.entryId },
      },
    });
    return NextResponse.json({ blocked: true });
  }

  if (watchMatch?.type === 'PURPLE') {
    const now = new Date();

    // Resolve through the canonical path (mints a QR, GUEST), then promote — the
    // PURPLE allowlist is a legitimate, operator-curated approval gate.
    const resolved = await resolveMember({
      workspaceId: application.workspaceId,
      email: application.email,
      name: application.fullName,
      clerkUserId: `app_${application.id}`,
      phone: application.phone ?? undefined,
      source: 'apply_purple',
    });
    const member = await promoteMemberToApproved(resolved.id, { approvedAt: now });

    await db.application.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: now, reviewedBy: 'system', memberId: member.id },
    });

    try {
      const html = await render(WelcomeEmail({ name: application.fullName, archetype: undefined }));
      await resend.emails.send({
        from: 'The No Bad Company <team@thenobadcompany.com>',
        to: application.email,
        subject: "you're in. welcome to no bad company.",
        html,
      });
    } catch (e) {
      console.error('Purple list welcome email failed', e);
    }

    await db.auditEvent.create({
      data: {
        workspaceId: application.workspaceId,
        actorType: 'SYSTEM',
        action: 'application.purple_list_approved',
        entityType: 'Application',
        entityId: application.id,
        metadata: { watchListEntryId: watchMatch.entryId },
      },
    });
    // Fall through to AI scoring so the archetype is computed even for auto-approvals.
  }

  // Question-agnostic AI scoring — driven by the template's QuestionDefinitions.
  const result = await scoreApplication(id);

  const answersText = application.answers
    .map((a) => `${a.questionKey}: ${a.answer}`)
    .join('\n');

  let personalizedCopy = '';
  try {
    const personPrompt = `You are writing a brief, personalized reveal message for a new NoBC (No Bad Company) member application.

Their archetype is: ${result.archetype}

Their application answers:
${answersText}

Write 2-3 sentences that feel like we truly read their application and see them. Be specific to their actual answers. Warm but not gushing. Write in second person ("you"). Do not mention the word "archetype". Do not be generic.`;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      prompt: personPrompt,
      maxOutputTokens: 200,
    });
    personalizedCopy = text.trim();
  } catch (e) {
    console.error('Personalization failed', e);
  }

  await db.application.update({
    where: { id },
    data: {
      archetype: result.archetype,
      archetypeScores: result.archetypeScores,
      aiTags: result.tags,
      // scoreApplication returns memberWorthTotal on a 0–100 scale; canonical
      // aiScore is 0–1. Scale at the persistence boundary only.
      aiScore: result.memberWorthTotal / 100,
      aiRecommendation: result.aiRecommendation,
      aiReasoning: result.aiReasoning,
      personalizedCopy,
    },
  });

  // Durable off-platform backup of the completed application — the company's most
  // critical data asset. Runs OUT OF BAND via after() so it never affects this
  // response or its timing; backupApplication is itself fail-closed and never
  // throws, the try/catch is a final belt-and-suspenders guard.
  after(async () => {
    try {
      await backupApplication(id);
    } catch (e) {
      console.error('[application-backup] write-through hook failed', {
        applicationId: id,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // Slack notify — fire-and-forget. Distinct events for "new application"
  // and "high-score application" (>= 22 on the 30 scale, i.e. ~0.73 on the
  // 0–1 canonical aiScore).
  void maybeFireSlack({
    workspaceId: application.workspaceId,
    type: 'application_new',
    title: `New application — ${application.fullName}`,
    body: result.archetype ?? undefined,
    link: `/operator/applications/${id}`,
  });
  if (result.memberWorthTotal >= 22 * (100 / 30)) {
    void maybeFireSlack({
      workspaceId: application.workspaceId,
      type: 'application_high',
      title: `High-score application — ${application.fullName}`,
      body: `${result.archetype ?? 'Unknown archetype'} · ${Math.round(result.memberWorthTotal / (100 / 30))}/30`,
      link: `/operator/applications/${id}`,
    });
  }

  return NextResponse.json({
    archetype: result.archetype,
    archetypeScores: result.archetypeScores,
    dimensionScores: result.dimensionScores,
    memberWorthTotal: result.memberWorthTotal,
    tags: result.tags,
    personalizedCopy,
  });
}
