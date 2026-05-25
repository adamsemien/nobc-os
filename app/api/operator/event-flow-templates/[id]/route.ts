import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { OperatorRole } from '@prisma/client';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  const template = await db.eventFlowTemplate.findFirst({ where: { id, workspaceId } });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.eventFlowTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
