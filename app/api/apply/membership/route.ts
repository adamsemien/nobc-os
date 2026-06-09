import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveMember } from '@/lib/member-identity';
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

  // Link identity at submission: resolve (or mint) the GUEST Member now so the
  // applicant has one continuous record before approval, not only at it.
  const member = await resolveMember({
    workspaceId: workspace.id,
    email,
    name: fullName ?? '',
    phone: phone ?? undefined,
    source: 'apply_membership',
  });

  const application = await db.application.create({
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
  });

  if (Object.keys(answers).length > 0) {
    await Promise.all(
      Object.entries(answers).map(([questionKey, answer]) =>
        upsertAnswer(application.id, questionKey, String(answer ?? '')),
      ),
    );
  }

  return NextResponse.json({ id: application.id });
}
