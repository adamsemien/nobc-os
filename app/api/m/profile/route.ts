import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      approvedAt: true,
    },
  });

  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const application = await db.application.findFirst({
    where: { workspaceId, email: member.email },
    orderBy: { createdAt: 'desc' },
    select: { city: true, neighborhood: true, status: true, id: true },
  });

  return NextResponse.json({
    member: {
      ...member,
      createdAt: member.createdAt.toISOString(),
      approvedAt: member.approvedAt?.toISOString() ?? null,
    },
    application,
  });
}

const patchSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const updated = await db.member.update({
    where: { id: member.id },
    data: {
      ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
      ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  return NextResponse.json({ member: updated });
}
