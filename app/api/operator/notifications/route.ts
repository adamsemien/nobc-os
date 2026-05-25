import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const limit = Math.min(50, Number(req.nextUrl.searchParams.get('limit') ?? 20));
  const notifications = await db.operatorNotification.findMany({
    where: { workspaceId, recipientId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const unread = await db.operatorNotification.count({
    where: { workspaceId, recipientId: userId, readAt: null },
  });
  return NextResponse.json({ notifications, unread });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let payload: { action?: string; id?: string } = {};
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (payload.action === 'mark_all_read') {
    const r = await db.operatorNotification.updateMany({
      where: { workspaceId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true, updated: r.count });
  }
  if (payload.action === 'mark_read' && payload.id) {
    await db.operatorNotification.updateMany({
      where: { id: payload.id, workspaceId, recipientId: userId },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
