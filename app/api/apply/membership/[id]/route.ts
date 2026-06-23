import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { APPLY_DRAFT_COOKIE, verifyApplyDraftToken } from '@/lib/apply-draft-token';
import { emailSchema, phoneSchema, shortText, answersMap, normalizePhone } from '@/lib/validation';

const ID_RE = /^[a-z0-9_-]{8,40}$/i;

const PatchSchema = z.object({
  fullName: shortText(100).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional().nullable(),
  city: shortText(100).optional().nullable(),
  referredBy: shortText(200).optional().nullable(),
  consentEmail: z.boolean().optional(),
  consentSms: z.boolean().optional(),
  answers: answersMap.optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // The id is exposed in the page URL, so it is not a credential. Require the
  // httpOnly cookie minted when this draft was created — without it, GET would
  // leak the applicant's PII to anyone who learns the id (IDOR).
  if (!verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value)) {
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
  // cookie so a leaked id cannot overwrite someone else's contact details.
  if (!verifyApplyDraftToken(id, req.cookies.get(APPLY_DRAFT_COOKIE)?.value)) {
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
    select: { id: true, status: true },
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

  const application = await db.application.update({
    where: { id },
    data: updateData,
  });

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

  return NextResponse.json({ id: application.id });
}
