import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const application = await db.application.findUnique({
    where: { id },
    include: { answers: true },
  });
  if (!application) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const answersMap: Record<string, string> = {};
  for (const a of application.answers) {
    answersMap[a.questionKey] = a.answer;
  }

  return NextResponse.json({ application, answers: answersMap });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { fullName, email, phone, city, referredBy, consentEmail, consentSms, answers = {} } = body;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (fullName !== undefined) updateData.fullName = fullName;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;
  if (city !== undefined) updateData.city = city;
  if (referredBy !== undefined) updateData.referredBy = referredBy;
  if (consentEmail !== undefined) updateData.consentEmail = consentEmail;
  if (consentSms !== undefined) updateData.consentSms = consentSms;

  const application = await db.application.update({
    where: { id },
    data: updateData,
  });

  for (const [questionKey, answer] of Object.entries(answers)) {
    const existing = await db.applicationAnswer.findFirst({ where: { applicationId: id, questionKey } });
    if (existing) {
      await db.applicationAnswer.update({ where: { id: existing.id }, data: { answer: answer as string } });
    } else {
      await db.applicationAnswer.create({ data: { applicationId: id, questionKey, answer: answer as string } });
    }
  }

  return NextResponse.json({ id: application.id });
}
