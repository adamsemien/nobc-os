import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

// Update a single conversation. Primary use is the per-conversation AI
// auto-reply toggle (`aiEnabled`), which the Railway inbound service reads to
// decide whether to auto-respond. Also accepts `name` (correct the patron's
// name) and `eventId` (associate the conversation with a published event) so
// the inbox needs no extra endpoints. Workspace-scoped on every field.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const { id } = await params;

  let body: { aiEnabled?: boolean; name?: string | null; eventId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const conversation = await db.smsConversation.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const data: { aiEnabled?: boolean; name?: string | null; eventId?: string | null } = {};
  if (typeof body.aiEnabled === 'boolean') data.aiEnabled = body.aiEnabled;
  if (body.name !== undefined) data.name = body.name?.trim() ? body.name.trim() : null;
  if (body.eventId !== undefined) {
    if (body.eventId === null) {
      data.eventId = null;
    } else {
      // Only associate events that belong to this workspace.
      const event = await db.event.findFirst({
        where: { id: body.eventId, workspaceId },
        select: { id: true },
      });
      if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      data.eventId = event.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const updated = await db.smsConversation.update({
    where: { id },
    data,
    select: { id: true, aiEnabled: true, name: true, eventId: true },
  });

  return NextResponse.json({ conversation: updated });
}
