import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveMember } from '@/lib/member-identity';
import { publicRateLimit } from '@/lib/public-rate-limit';
import { emailSchema, phoneSchema, shortText, answersMap, normalizePhone } from '@/lib/validation';

const PostSchema = z.object({
  fullName: shortText(100).optional(),
  email: emailSchema,
  phone: phoneSchema.optional().nullable(),
  city: shortText(100).optional().nullable(),
  referredBy: shortText(200).optional().nullable(),
  answers: answersMap.optional(),
});

/**
 * Resolve the workspace for the slug-less public membership apply form.
 *
 * Prefers an explicit `APPLY_DEFAULT_WORKSPACE_ID` (the multi-tenant-safe path).
 * Falls back to the OLDEST workspace — deterministic, unlike a bare findFirst()
 * with no ordering, and identical to tenant-zero behaviour on a single-tenant
 * install. If a second workspace ever exists with no default configured, this
 * route is genuinely ambiguous: we log loudly so the tripwire fires before any
 * applicant is silently routed to whichever row Postgres happens to return.
 */
async function resolveDefaultApplyWorkspace(): Promise<{ id: string } | null> {
  const configuredId = process.env.APPLY_DEFAULT_WORKSPACE_ID;
  if (configuredId) {
    return db.workspace.findUnique({ where: { id: configuredId }, select: { id: true } });
  }
  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: 'asc' },
    take: 2,
    select: { id: true },
  });
  if (workspaces.length > 1) {
    console.error(
      '[apply/membership] Multiple workspaces exist but APPLY_DEFAULT_WORKSPACE_ID is unset — ' +
        'defaulting to the oldest. Set APPLY_DEFAULT_WORKSPACE_ID before onboarding a second tenant.',
    );
  }
  return workspaces[0] ?? null;
}

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

  // Multi-tenant resolution: this endpoint is unauthenticated public apply
  // submission with no slug, so it resolves the default workspace. Named
  // templates use /api/apply/[slug] for explicit tenant resolution.
  const workspace = await resolveDefaultApplyWorkspace();
  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });

  // Idempotency: a network timeout before the client receives the new `id` (and
  // appends `?id=` to the URL) makes the user retry screen 0 — without this guard
  // that retry mints a second Application for the same person. If an in-progress
  // (PENDING) application already exists for (workspaceId, email), reuse it so the
  // draft converges to a single row. APPROVED/REJECTED rows are NOT reused — a
  // genuine re-application after a decision should create a fresh row.
  const existingPending = await db.application.findFirst({
    where: {
      workspaceId: workspace.id,
      email: { equals: email, mode: 'insensitive' },
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
    }
    return NextResponse.json({ id: existingPending.id });
  }

  // Link identity at submission: resolve (or mint) the GUEST Member now so the
  // applicant has one continuous record before approval, not only at it.
  const member = await resolveMember({
    workspaceId: workspace.id,
    email,
    name: fullName ?? '',
    phone: phone ?? undefined,
    source: 'apply_membership',
  });

  let application: { id: string };
  try {
    application = await db.application.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        email,
        fullName: fullName ?? '',
        phone: normalizePhone(phone ?? null),
        city: city ?? null,
        referredBy: referredBy ?? null,
        consentEmail: false,
        consentSms: false,
      },
      select: { id: true },
    });
  } catch (e) {
    // Defensive: if the additive partial-unique index has been applied (see
    // prisma/sql/apply-dedup-partial-unique.sql), a concurrent double-submit that
    // races past the findFirst above surfaces as P2002. Recover by re-reading the
    // row the other request created rather than 500-ing the applicant. Works
    // correctly whether or not the index is live yet.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const raced = await db.application.findFirst({
        where: { workspaceId: workspace.id, email: { equals: email, mode: 'insensitive' } },
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
        }
        return NextResponse.json({ id: raced.id });
      }
    }
    console.error('[apply/membership] application.create failed', {
      workspaceId: workspace.id,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Could not save application' }, { status: 500 });
  }

  if (Object.keys(answers).length > 0) {
    await Promise.all(
      Object.entries(answers).map(([questionKey, answer]) =>
        upsertAnswer(application.id, questionKey, String(answer ?? '')),
      ),
    );
  }

  return NextResponse.json({ id: application.id });
}
