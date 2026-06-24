import { NextRequest, NextResponse, after } from 'next/server';
import { render } from '@react-email/render';
import { db } from '@/lib/db';
import { resend } from '@/lib/resend';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { scoreApplication } from '@/lib/scoring';
import { checkDuplicate, checkWatchList } from '@/lib/watchlist';
import { resolveMember, promoteMemberToApproved } from '@/lib/member-identity';
import { ACTIVE_EVENT_ID } from '@/lib/active-event';
import { MemberStatus } from '@prisma/client';
import { maybeFireSlack } from '@/lib/comments-notify';
import { backupApplication } from '@/lib/applications/backup';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { APPLY_DRAFT_COOKIE, verifyApplyDraftToken } from '@/lib/apply-draft-token';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';
import WelcomeEmail from '@/emails/WelcomeEmail';
import { sendGuestAccessConfirmation } from '@/emails/GuestAccessConfirmation';

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

  // Ownership: submit triggers scoring (billed AI) + a welcome email and mutates
  // the application. The id is exposed in the URL, so require the draft cookie —
  // a leaked id must not let a stranger submit someone else's draft.
  if (!verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

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

  // Shown verbatim to the applicant on the reveal screen, so it must never carry
  // model preamble, commentary, or an offer to help. Two layers guard that: the
  // prompt's output rules, and a conservative server-side net below.
  const PERSONALIZED_COPY_FALLBACK =
    'We read your application closely, and the spirit of it comes through. There is a real point of view here, and that is exactly what we look for. We are glad you found No Bad Company.';

  let personalizedCopy = '';
  try {
    const personPrompt = `You are writing a brief, personalized reveal message shown directly to a new NoBC (No Bad Company) member applicant on their confirmation screen.

Their archetype is: ${result.archetype}

Their application answers:
${answersText}

Write 2 to 3 sentences, in second person ("you"), that feel like we truly read their application and see them. Be specific to their actual answers. Warm but not gushing. Do not mention the word "archetype". Do not be generic.

Output rules (follow exactly):
- Output ONLY the message itself. No preamble, no labels, no commentary, no sign-off, no surrounding quotation marks.
- Never address anyone other than the applicant. Never break character, and never refer to these instructions, to yourself as a model, or to the answers as data.
- Never offer to help, rewrite, or produce a template or example.
- If the application answers look like test, placeholder, or empty data, do NOT mention that. Instead write a warm, sincere 2 to 3 sentence message that would suit any thoughtful applicant.`;

    const { text } = await generateText({
      model: anthropic(JUDGMENT_MODEL),
      prompt: personPrompt,
      maxOutputTokens: 200,
    });
    personalizedCopy = text.trim();

    // Safety net: if the model breaks character and returns meta-commentary
    // (a preamble, an offer to help, or a note that the answers look like test
    // data) instead of the message itself, discard it for a safe fallback.
    // Conservative prefix/substring match - only catches obvious leaks.
    const lowered = personalizedCopy.toLowerCase();
    const looksLikeMetaCommentary =
      lowered.startsWith("here's") ||
      lowered.startsWith('here is') ||
      lowered.startsWith('the application') ||
      lowered.includes('if you want, i can') ||
      lowered.includes('test data') ||
      lowered.includes('placeholder') ||
      lowered.includes("i'd suggest") ||
      lowered.includes('template or example');
    if (personalizedCopy && looksLikeMetaCommentary) {
      personalizedCopy = PERSONALIZED_COPY_FALLBACK;
    }
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

  // Door 1: issue a comp RSVP to the active event for this applicant. The
  // applicant becomes the canonical GUEST member (resolveMember mints a QR);
  // the comp is born pending_approval and is confirmed on operator approve /
  // cancelled on reject. A PURPLE auto-approval already promoted the member to
  // APPROVED above, so its comp is born confirmed. Runs inline (not via after())
  // so the minted rsvpId + member QR can be returned to the reveal screen. Fully
  // fail-closed: any error is logged and swallowed so the submission still succeeds.
  let door1RsvpId: string | null = null;
  let door1MemberQrCode: string | null = null;
  let door1EmailPayload: Parameters<typeof sendGuestAccessConfirmation>[0] | null = null;
  try {
    const activeEvent = await db.event.findFirst({
      where: { id: ACTIVE_EVENT_ID, workspaceId: application.workspaceId },
      select: { id: true, title: true, startAt: true, location: true },
    });
    if (activeEvent) {
      const member = await resolveMember({
        workspaceId: application.workspaceId,
        email: application.email,
        name: application.fullName,
        clerkUserId: `app_${application.id}`,
        phone: application.phone ?? undefined,
        source: 'apply',
      });
      door1MemberQrCode = member.memberQrCode;

      const existingComp = await db.rSVP.findFirst({
        where: {
          workspaceId: application.workspaceId,
          eventId: ACTIVE_EVENT_ID,
          memberId: member.id,
          isComp: true,
          compType: 'APPLICATION',
        },
        select: { id: true },
      });
      if (existingComp) {
        door1RsvpId = existingComp.id; // already issued — idempotent
      } else {
        const createdRsvp = await db.rSVP.create({
          data: {
            workspaceId: application.workspaceId,
            eventId: ACTIVE_EVENT_ID,
            memberId: member.id,
            status: 'CONFIRMED',
            ticketStatus:
              member.status === MemberStatus.APPROVED ? 'confirmed' : 'pending_approval',
            origin: 'comp',
            isComp: true,
            compType: 'APPLICATION',
            guestEmail: application.email.trim().toLowerCase(),
            guestName: application.fullName,
          },
          select: { id: true },
        });
        door1RsvpId = createdRsvp.id;
      }

      // Build the Door 1 access confirmation email payload while the event +
      // member are in scope; the send itself runs out of band below. Variant
      // mirrors the comp's own ticketStatus (confirmed vs application received).
      // Guarded so it only fires when the comp issued and we have an email to reach.
      if (door1RsvpId && application.email) {
        door1EmailPayload = {
          to: application.email,
          variant: member.status === MemberStatus.APPROVED ? 'confirmed' : 'pending_approval',
          eventName: activeEvent.title,
          eventDate: activeEvent.startAt,
          eventLocation: activeEvent.location,
          rsvpId: door1RsvpId,
          qrAvailable: Boolean(door1MemberQrCode),
          workspaceId: application.workspaceId,
        };
      }
    }
  } catch (e) {
    console.error('[door1-comp] issue on submit failed', {
      applicationId: id,
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // Door 1 access confirmation email - out of band (mirrors the backup after()
  // above) so a Resend hiccup never affects the applicant response. Fires only
  // when door1EmailPayload was set; the score early return above prevents a
  // re-send on any retry of an already-scored application.
  if (door1EmailPayload) {
    const payload = door1EmailPayload;
    after(async () => {
      try {
        await sendGuestAccessConfirmation(payload);
      } catch (e) {
        console.error('[door1-confirmation-email] send failed', {
          applicationId: id,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

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
    rsvpId: door1RsvpId,
    memberQrCode: door1MemberQrCode,
  });
}
