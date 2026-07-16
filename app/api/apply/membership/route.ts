import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolvePerson } from '@/lib/crm/resolve-person';
import { logEngagementEvent } from '@/lib/engagement';
import { resolveDefaultApplyWorkspace } from '@/lib/apply-workspace';
import { stampApplicationOwner, getVerifiedClerkEmail } from '@/lib/apply-account-link';
import { publicRateLimit } from '@/lib/public-rate-limit';
import {
  APPLY_DRAFT_COOKIE,
  APPLY_DRAFT_COOKIE_MAX_AGE,
  signApplyDraftToken,
} from '@/lib/apply-draft-token';
import { emailSchema, phoneSchema, shortText, answersMap, normalizePhone } from '@/lib/validation';
import { scalarsFromAnswers } from '@/lib/apply/promote-answers';

/** JSON `{ id }` response that also sets the httpOnly draft-access cookie, so
 *  only the creating browser can later GET/PATCH/submit this draft. */
function draftCreated(id: string): NextResponse {
  const res = NextResponse.json({ id });
  const token = signApplyDraftToken(id);
  if (token) {
    res.cookies.set(APPLY_DRAFT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: APPLY_DRAFT_COOKIE_MAX_AGE,
    });
  }
  return res;
}

const PostSchema = z.object({
  fullName: shortText(100).optional(),
  email: emailSchema,
  phone: phoneSchema.optional().nullable(),
  city: shortText(100).optional().nullable(),
  referredBy: shortText(200).optional().nullable(),
  answers: answersMap.optional(),
});

async function upsertAnswer(applicationId: string, questionKey: string, answer: string) {
  const existing = await db.applicationAnswer.findFirst({
    where: { applicationId, questionKey },
  });
  if (existing) {
    await db.applicationAnswer.update({ where: { id: existing.id }, data: { answer } });
  } else {
    await db.applicationAnswer.create({ data: { applicationId, questionKey, answer } });
  }
}

export async function POST(req: NextRequest) {
  // Abuse protection: cap rapid automated draft creation before any DB work.
  // In-memory per-IP limiter (resets on cold start) — see the FLAG in the
  // hardening report: production-grade distributed limiting needs a shared store.
  const rateCheck = publicRateLimit(req);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfterSecs) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 422 },
    );
  }
  const { fullName, email, phone, city, referredBy, answers = {} } = parsed.data;

  // Additive account link (PR1): if the caller happens to be signed in, the draft
  // is stamped with their Clerk id so they can resume it cross-device. Anonymous
  // callers resolve to userId=null and the path below is byte-for-byte unchanged.
  const { userId } = await auth();

  // Multi-tenant resolution: this endpoint is unauthenticated public apply
  // submission with no slug, so it resolves the default workspace. Named
  // templates use /api/apply/[slug] for explicit tenant resolution.
  const workspace = await resolveDefaultApplyWorkspace();
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });

  // The ONLY email we trust for reusing (and re-issuing the draft-access cookie for)
  // a pre-existing row is the signed-in caller's VERIFIED Clerk email. The body email
  // is attacker-controlled: matching a stranger's PENDING draft on it and returning
  // that draft's cookie was an IDOR - anyone could POST {email:"victim@..."} and
  // receive read/write access to the victim's draft + answers. Resolved once here and
  // reused as the create email below.
  const verifiedEmail = userId ? await getVerifiedClerkEmail(userId) : null;

  // Idempotency (ownership-gated): a network timeout before the client receives the
  // new `id` makes a signed-in applicant retry screen 0 - reuse their in-progress
  // PENDING row so the draft converges to one, matched on their VERIFIED email only.
  // Anonymous or non-matching callers never reuse here; they fall through to create a
  // fresh row (the P2002 recovery below still collapses a genuine same-owner race).
  // APPROVED/REJECTED rows are NOT reused - a re-application after a decision is fresh.
  if (userId && verifiedEmail) {
    const existingPending = await db.application.findFirst({
      where: {
        workspaceId: workspace.id,
        email: { equals: verifiedEmail, mode: 'insensitive' },
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existingPending) {
      // Persist any answers carried in this retry, then return the existing draft.
      if (Object.keys(answers).length > 0) {
        await Promise.all(
          Object.entries(answers).map(([questionKey, answer]) =>
            upsertAnswer(existingPending.id, questionKey, String(answer ?? '')),
          ),
        );
        // Scalar promotion (write path): the reuse branch previously never
        // touched the typed columns — promote parseable contact scalars from
        // the carried answers so the reused draft converges too.
        const scalars = scalarsFromAnswers(answers);
        if (Object.keys(scalars).length > 0) {
          await db.application.update({ where: { id: existingPending.id }, data: scalars });
        }
      }
      await stampApplicationOwner(existingPending.id, userId);
      return draftCreated(existingPending.id);
    }
  }

  // D4c: for a signed-in applicant the verified Clerk email is the single source of
  // truth — override any email in the request body server-side. Falls back to the
  // validated body email only when unauthenticated or the Clerk email is
  // unverified/unavailable. Scoped to this create (the sole body-email write site);
  // The reuse + P2002 recovery paths are gated on this same verified email, never body.
  const createEmail = verifiedEmail ?? email;

  // Person spine first touch (Campaign 1 item 2): a draft mints a Person, NOT a
  // guest Member — People is the first-touch surface; Members is the earned one,
  // minted at submit (Door 1 comp) or approval, both of which resolve their own
  // Member by email. A signed-in applicant's Clerk-verified email links to their
  // existing Person; a typed email stays unverified and never links (strict
  // policy). Non-fatal: an application must never fail on spine errors.
  let personId: string | null = null;
  try {
    const nameParts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    const person = await resolvePerson({
      workspaceId: workspace.id,
      clerkUserId: userId ?? null,
      email: createEmail,
      emailVerified: Boolean(verifiedEmail),
      phone: phone ?? null,
      firstName: nameParts[0] || null,
      lastName: nameParts.slice(1).join(' ') || null,
      source: 'application',
    });
    personId = person.id;
  } catch (err) {
    console.error('[apply/membership] person spine mint failed:', err);
  }

  let application: { id: string };
  try {
    application = await db.application.create({
      data: {
        workspaceId: workspace.id,
        // No memberId at draft stage — the approval gate links it (Campaign 1 item 2).
        // Person spine: the human behind this application, minted at start.
        personId,
        clerkUserId: userId ?? null,
        email: createEmail,
        fullName: fullName ?? '',
        phone: normalizePhone(phone ?? null),
        city: city ?? null,
        referredBy: referredBy ?? null,
        consentEmail: false,
        consentSms: false,
        // Scalar promotion (write path): answers carried on create win over the
        // body fields when parseable — one normalizer (toE164) on the answers path.
        ...scalarsFromAnswers(answers),
      },
      select: { id: true },
    });
  } catch (e) {
    // Defensive: if the additive partial-unique index has been applied (see
    // prisma/sql/apply-dedup-partial-unique.sql), a concurrent double-submit that
    // races past the findFirst above surfaces as P2002. Recover by re-reading the
    // row the other request created rather than 500-ing the applicant. Works
    // correctly whether or not the index is live yet.
    // Recover the row the concurrent create won - but only re-issue its draft cookie
    // to a VERIFIED owner (same IDOR guard as the idempotency branch: never hand back
    // a pre-existing row's id/cookie on an unverified body email). Match on the trusted
    // verified email. An anonymous P2002 collision means a PENDING row already exists
    // but ownership is unproven, so fall through to the 500 below rather than leak it.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      userId &&
      verifiedEmail
    ) {
      const raced = await db.application.findFirst({
        where: { workspaceId: workspace.id, email: { equals: verifiedEmail, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (raced) {
        if (Object.keys(answers).length > 0) {
          await Promise.all(
            Object.entries(answers).map(([questionKey, answer]) =>
              upsertAnswer(raced.id, questionKey, String(answer ?? '')),
            ),
          );
          // Scalar promotion (write path): mirror the reuse branch — the raced
          // row must converge from carried answers too.
          const scalars = scalarsFromAnswers(answers);
          if (Object.keys(scalars).length > 0) {
            await db.application.update({ where: { id: raced.id }, data: scalars });
          }
        }
        await stampApplicationOwner(raced.id, userId);
        return draftCreated(raced.id);
      }
    }
    console.error('[apply/membership] application.create failed', {
      workspaceId: workspace.id,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Could not save application' }, { status: 500 });
  }

  // Person spine (Phase 2A): first-touch funnel signal — the draft exists even
  // if the applicant never submits (the Trent gap). Fire-and-forget.
  void logEngagementEvent({
    workspaceId: workspace.id,
    personId,
    eventType: 'application_started',
    metadata: { applicationId: application.id, source: 'apply_membership' },
  });

  if (Object.keys(answers).length > 0) {
    await Promise.all(
      Object.entries(answers).map(([questionKey, answer]) =>
        upsertAnswer(application.id, questionKey, String(answer ?? '')),
      ),
    );
  }

  return draftCreated(application.id);
}
