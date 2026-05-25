import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { sendSms } from '@/lib/twilio';

// Operator manual reply from the shared inbox. Requires STAFF or above. Sends
// via the Twilio REST API, then records the OUTBOUND message so the thread only
// reflects messages Twilio actually accepted.
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: { conversationId?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const conversationId = body.conversationId;
  const text = body.body?.trim();
  if (!conversationId || !text) {
    return NextResponse.json({ error: 'conversationId and body required' }, { status: 400 });
  }

  const conversation = await db.smsConversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true, phone: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  try {
    await sendSms(conversation.phone, text);
  } catch (e) {
    console.error('[sms/reply] Twilio send failed', e);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 502 });
  }

  await db.smsMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      body: text,
      aiGenerated: false,
    },
  });

  return NextResponse.json({ success: true });
}
