import { NextRequest, NextResponse, after } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { mirrorApplicationPhotosToDam } from '@/lib/apply-photo-mirror';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { APPLY_DRAFT_COOKIE, verifyApplyDraftToken } from '@/lib/apply-draft-token';
import { isApplicationAccountOwner } from '@/lib/apply-account-link';
import { emailSchema, phoneSchema, shortText, answersMap, normalizePhone } from '@/lib/validation';
import { structuredConsentWrites, getConsentIp } from '@/lib/apply-consent';

const ID_RE = /^[a-z0-9_-]{8,40}$/i;

/**
 * Draft access (PR1, additive): authorized by EITHER the original device-bound
 * draft cookie OR — only when that cookie is absent/invalid — a signed-in caller
 * who owns this application by account (`Application.clerkUserId === userId`).
 *
 * The cookie path short-circuits first and is byte-for-byte unchanged, so
 * anonymous callers and existing cookie holders behave exactly as before; the
 * account branch is reachable only on a cookie miss (e.g. a second device).
 */
async function authorizeDraftAccess(req: NextRequest, id: string): Promise<boolean> {
  if (verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value)) return true;
  const { userId } = await auth();
  return isApplicationAccountOwner(id, userId);
}

const PatchSchema = z.object({
  fullName: shortText(100).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional().nullable(),
  city: shortText(100).optional().nullable(),
  referredBy: shortText(200).optional().nullable(),
  consentEmail: z.boolean().optional(),
  consentSms: z.boolean().optional(),
  // PHASE C: the three House Rules checkboxes write these independent signals.
  agreedToMembershipTerms: z.boolean().optional(),
  emailOptIn: z.boolean().optional(),
  answers: answersMap.optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // The id is exposed in the page URL, so it is not a credential. Require the
  // httpOnly cookie minted when this draft was created (or account ownership for a
  // signed-in resume) — without it, GET would leak the applicant's PII to anyone
  // who learns the id (IDOR).
  if (!(await authorizeDraftAccess(req, id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Only PENDING applications expose their draft via the resume flow.
  // Internal AI fields and reviewer notes are never returned through this endpoint.
  const application = await db.application.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      fullName: true,
      email: true,
      phone: true,
      city: true,
      referredBy: true,
      consentEmail: true,
      consentSms: true,
      // PHASE B: returned so the form rehydrates the submit gate from the
      // structured signal (with consentEmail as the in-flight backfill fallback).
      agreedToMembershipTerms: true,
      answers: { select: { questionKey: true, answer: true } },
    },
  });
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (application.status !== 'PENDING') {
    return NextResponse.json({ error: 'Not editable' }, { status: 403 });
  }

  const answersMapOut: Record<string, string> = {};
  for (const a of application.answers) {
    answersMapOut[a.questionKey] = a.answer;
  }
  // Strip internal answers from public response
  const { answers, ...rest } = application;
  return NextResponse.json({ application: rest, answers: answersMapOut });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Generous per-IP backstop against pathological hammering of the public draft
  // PATCH. A legitimate applicant makes ~6-8 saves per session, so the cap is set
  // high enough to clear several applicants behind one NAT IP.
  const rate = publicRateLimit(req, { bucket: 'apply-patch', max: 120 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down and try again.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSecs) } },
    );
  }

  // Ownership: the id is in the URL and not a credential — require the draft
  // cookie (or account ownership for a signed-in resume) so a leaked id cannot
  // overwrite someone else's contact details.
  if (!(await authorizeDraftAccess(req, id))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 422 },
    );
  }

  const existing = await db.application.findUnique({
    where: { id },
    // PHASE B: prior consent timestamps drive stamp-once — the original
    // acceptance time must survive the final-submit re-PATCH.
    // workspaceId + fullName feed the post-response DAM photo mirror below.
    select: {
      id: true,
      status: true,
      termsAcceptedAt: true,
      emailOptInAt: true,
      smsOptInAt: true,
      workspaceId: true,
      fullName: true,
    },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Once an application leaves PENDING, the draft endpoint is closed.
  if (existing.status !== 'PENDING') {
    return NextResponse.json({ error: 'Not editable' }, { status: 403 });
  }

  const { answers = {}, ...fields } = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.fullName !== undefined) updateData.fullName = fields.fullName;
  if (fields.email !== undefined) updateData.email = fields.email;
  if (fields.phone !== undefined) updateData.phone = normalizePhone(fields.phone ?? null);
  if (fields.city !== undefined) updateData.city = fields.city;
  if (fields.referredBy !== undefined) updateData.referredBy = fields.referredBy;
  if (fields.consentEmail !== undefined) updateData.consentEmail = fields.consentEmail;
  if (fields.consentSms !== undefined) updateData.consentSms = fields.consentSms;

  // PHASE B dual-write: derive the structured consent columns from the same
  // booleans written above. Legacy consentEmail/consentSms writes are unchanged.
  // This single site covers both the front-gate consent PATCH and the
  // final-submit PATCH (both land here). IP/UA captured at the agreement write.
  Object.assign(
    updateData,
    structuredConsentWrites({
      consentEmail: fields.consentEmail,
      consentSms: fields.consentSms,
      agreedToMembershipTerms: fields.agreedToMembershipTerms,
      emailOptIn: fields.emailOptIn,
      now: new Date(),
      ip: getConsentIp(req),
      userAgent: req.headers.get('user-agent'),
      existing,
    }),
  );

  const application = await db.application.update({
    where: { id },
    data: updateData,
  });

  // DAM photo mirror: capture the prior photos.urls value BEFORE the upsert
  // loop overwrites it, so a retried submit can retire the assets it replaced.
  const incomingPhotoUrls =
    typeof answers['photos.urls'] === 'string' ? answers['photos.urls'] : undefined;
  let previousPhotoUrls: string | null = null;
  if (incomingPhotoUrls !== undefined) {
    const prev = await db.applicationAnswer.findFirst({
      where: { applicationId: id, questionKey: 'photos.urls' },
      select: { answer: true },
    });
    previousPhotoUrls = prev?.answer ?? null;
  }

  for (const [questionKey, answer] of Object.entries(answers)) {
    const existingAnswer = await db.applicationAnswer.findFirst({
      where: { applicationId: id, questionKey },
    });
    const value = String(answer ?? '');
    if (existingAnswer) {
      await db.applicationAnswer.update({ where: { id: existingAnswer.id }, data: { answer: value } });
    } else {
      await db.applicationAnswer.create({ data: { applicationId: id, questionKey, answer: value } });
    }
  }

  if (incomingPhotoUrls !== undefined) {
    // Mirror the applicant's photos into the DAM after the response is sent.
    // Best-effort and fully isolated (the mirror logs + swallows every error),
    // so it can never fail or slow this PATCH — never break /apply.
    after(() =>
      mirrorApplicationPhotosToDam({
        applicationId: id,
        workspaceId: existing.workspaceId,
        applicantName: existing.fullName,
        photoUrlsAnswer: incomingPhotoUrls,
        previousPhotoUrlsAnswer: previousPhotoUrls,
      }),
    );
  }

  return NextResponse.json({ id: application.id });
}
