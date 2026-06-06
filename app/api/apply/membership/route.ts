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

  // Multi-tenant note: this endpoint is unauthenticated public apply submission
  // and currently routes to the first workspace (NoBC tenant zero). Named
  // templates use /api/apply/[slug] for explicit tenant resolution.
  const workspace = await db.workspace.findFirst({ select: { id: true } });
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
