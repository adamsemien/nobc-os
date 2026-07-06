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
import { auth } from '@clerk/nextjs/server';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { APPLY_DRAFT_COOKIE, verifyApplyDraftToken } from '@/lib/apply-draft-token';
import { isApplicationAccountOwner } from '@/lib/apply-account-link';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';
import { buildPersonalNote } from '@/lib/applications/personal-note';
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
  // the application. The id is exposed in the URL, so require the draft cookie (or
  // account ownership for a signed-in submit) — a leaked id must not let a
  // stranger submit someone else's draft. The cookie path is checked first and is
  // unchanged; the account branch runs only on a cookie miss.
  const submitAuthorized =
    verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value) ||
    (await isApplicationAccountOwner(id, (await auth()).userId));
  if (!submitAuthorized) {
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
  // the client reads archetype / archetypeScores / tags / personalNote, all of
  // which are durably stored on the row. Legacy rows scored before the reveal
  // rebuild have no personalNote, so fall back to their persisted personalizedCopy.
  if (application.aiScore !== null) {
    return NextResponse.json({
      cached: true,
      archetype: application.archetype ?? '',
      archetypeScores: (application.archetypeScores ?? {}) as Record<string, number>,
      tags: application.aiTags,
      personalNote: application.personalNote ?? application.personalizedCopy ?? '',
    });
  }
  // A terminal status with no score means the BLOCKED auto-reject path already
  // ran (BLOCKED short-circuits before scoring). Replaying it must stay a no-op.
  if (application.status === 'REJECTED') {
    return NextResponse.json({ blocked: true, cached: true });
  }

  // ── Atomic once-only guard ────────────────────────────────────────────
  // Concurrent submits for the same draft (two tabs, a network retry, a replayed or
  // account-relinked cookie) would each pass the idempotency guard above while aiScore
  // is still null and then score INDEPENDENTLY - two billed Sonnet calls each, a
  // duplicated Door 1 (and PURPLE) email, duplicate audit rows. Serialize per-draft on
  // a Postgres transaction-scoped advisory lock: a second submit blocks until the
  // first COMMITS (durably writing aiScore below), then re-reads it non-null and
  // returns the cached reveal - never billing or emailing twice. The xact lock
  // releases automatically when the transaction ends INCLUDING on error, so a scoring
  // failure never locks a draft out (a retry re-enters with aiScore still null). No
  // schema change: the existing aiScore column is the durable "already scored" signal.
  // scoreApplication / lib/scoring.ts are unchanged - the lock is taken AROUND the
  // call, here in the route. The whole scoring + email critical section runs inside;
  // Door 1 + confirmation email (after the lock) is winner-only because a loser
  // returns cached from within the lock and never reaches it.
  const outcome = await db.$transaction(async (tx) => {
  // $executeRaw, NOT $queryRaw: pg_advisory_xact_lock() returns Postgres `void`,
  // which Prisma 7's $queryRaw cannot deserialize (P2010 "Failed to deserialize
  // column of type 'void'" - this 500'd every prod submission, 2026-07-02).
  // $executeRaw runs the statement and discards the result; the lock semantics
  // are identical (verified: lock held inside the tx, released at COMMIT/ROLLBACK).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;

  // Re-read under the lock. If a concurrent submit already scored (or was decided),
  // return its persisted reveal and do NO scoring / billing / email on this request.
  const locked = await tx.application.findUnique({
    where: { id },
    select: {
      aiScore: true,
      status: true,
      archetype: true,
      archetypeScores: true,
      aiTags: true,
      personalNote: true,
      personalizedCopy: true,
    },
  });
  if (locked && locked.aiScore !== null) {
    return NextResponse.json({
      cached: true,
      archetype: locked.archetype ?? '',
      archetypeScores: (locked.archetypeScores ?? {}) as Record<string, number>,
      tags: locked.aiTags,
      personalNote: locked.personalNote ?? locked.personalizedCopy ?? '',
    });
  }
  if (locked && locked.status === 'REJECTED') {
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

  // Build the answer lookup once: bare keys for simple fields, dotted keys for
  // group sub-fields (referrals.referral1First, ...). resolveAnswer joins the
  // referrals sub-fields back into one string.
  const answersByKey: Record<string, string> = {};
  for (const a of application.answers) answersByKey[a.questionKey] = a.answer;

  // Reveal "Why we called you this" note. buildPersonalNote assembles the only
  // evidence the note quotes from (what people come to them for, what they do
  // walking into a room, and the single highest-signal answer for their top
  // archetype), calls the model once, and guards the draft: it is shown verbatim
  // on the reveal, so any model preamble is stripped and any failure yields null
  // (the reveal omits the beat gracefully). The LOCKED JUDGMENT_MODEL wiring
  // stays here at the call site; the deterministic logic lives in the helper.
  const personalNote = await buildPersonalNote({
    archetype: result.archetype,
    answersByKey,
    generate: async (prompt) => {
      const { text } = await generateText({
        model: anthropic(JUDGMENT_MODEL),
        prompt,
        maxOutputTokens: 220,
      });
      return text;
    },
  });

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
      // The six-archetype reveal writes personalNote; personalizedCopy is no
      // longer written for new applications (legacy rows keep theirs).
      personalNote,
    },
  });

  return { result, personalNote };
  }, { timeout: 60_000, maxWait: 20_000 });

  // A loser (or a duplicate / blocked terminal path) already returned its NextResponse
  // from inside the lock; re-emit it and skip the winner-only Door 1 + email below.
  if (outcome instanceof NextResponse) return outcome;
  const { result, personalNote } = outcome;

  // TODO(ways-in-phase-a, ON HOLD): emit the application-submitted engagement
  // fact here - the submit has definitively succeeded at this point. Emission
  // is deliberately NOT wired yet: the fact name is pending reconciliation
  // with the CRM owner between the two candidates -
  //   'application_submitted' (in the enum since member-intelligence PR1; no
  //     emitter anywhere) vs
  //   'application_started' (Phase 2A value, already emitted at DRAFT CREATE
  //     in app/api/apply/[slug]/route.ts and app/api/apply/membership/route.ts
  //     - a different moment in the funnel).
  // Do not pick a name here without that reconciliation (spec §11).

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
    personalNote: personalNote ?? '',
    rsvpId: door1RsvpId,
    memberQrCode: door1MemberQrCode,
  });
}
