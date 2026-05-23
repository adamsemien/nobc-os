import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { sendSms } from '@/lib/twilio';

// Operator manual reply from the shared inbox. Any operator in the workspace
// can reply (workspace membership is the boundary). Sends via the Twilio REST
// API, then records the OUTBOUND message so the thread only reflects messages
// Twilio actually accepted.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

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
