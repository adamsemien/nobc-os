import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const template = await db.eventFlowTemplate.findFirst({ where: { id, workspaceId } });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.eventFlowTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
