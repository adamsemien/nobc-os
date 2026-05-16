import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
  const body = await req.json();
  const { fullName, email, phone, city, referredBy, answers = {} } = body;

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const workspace = await db.workspace.findFirst();
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 500 });

  const application = await db.application.create({
    data: {
      workspaceId: workspace.id,
      email,
      fullName: fullName ?? '',
      phone: phone ?? null,
      city: city ?? null,
      referredBy: referredBy ?? null,
      consentEmail: false,
      consentSms: false,
    },
  });

  if (Object.keys(answers).length > 0) {
    await Promise.all(
      Object.entries(answers).map(([questionKey, answer]) =>
        upsertAnswer(application.id, questionKey, answer as string)
      )
    );
  }

  return NextResponse.json({ id: application.id });
}
