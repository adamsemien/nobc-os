import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { sendSms } from '@/lib/twilio';
import { alert } from '@/lib/alerting';
import { evaluateConsent } from '@/lib/comms/can-send';

// Operator manual reply from the shared inbox. Authorized by Clerk org
// membership: any member of the resolved workspace's Clerk org may reply (no
// separate WorkspaceMember/role row required — workspace membership is the
// boundary, as in the original House Phone spec). Sends via the Twilio REST
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

  // Consent floor (Phase 1) — SHADOW ONLY, observability. A House Phone reply is a
  // 1:1 conversational message to someone who texted in; it is consent-EXEMPT and
  // must NEVER be blocked by marketing consent, even after enforcement flips.
  // evaluateConsent in shadow mode returns block=false, so this only logs.
  // TODO(enforcement): keep replies exempt — do NOT gate this path on `.block`.
  try {
    const member = await db.member.findFirst({
      where: { workspaceId, phone: conversation.phone },
      select: { id: true, email: true, phone: true },
    });
    if (member) {
      await evaluateConsent({ workspaceId, member, channel: 'SMS', site: 'sms.reply' });
    }
  } catch (err) {
    console.error('[sms/reply] consent shadow probe failed (non-blocking):', err);
  }

  try {
    await sendSms(conversation.phone, text);
  } catch (e) {
    void alert({
      severity: 'error',
      event: 'sms.reply.twilio_send_failed',
      workspaceId,
      context: {
        conversationId: conversation.id,
        errorClass: e instanceof Error ? e.constructor.name : 'unknown',
        errorMessage: e instanceof Error ? e.message : String(e),
      },
    });
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
