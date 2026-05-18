/** Phase J — outbound event sync to Producer (Replit operator-ops layer).
 *
 *  When NoBC OS publishes, updates, or cancels an event, it fires an
 *  HMAC-SHA256-signed POST to Producer's /api/webhooks/nobc-os/event-notify.
 *  Fire-and-forget with one retry — never blocks the operator action.
 *  Success and failure are both logged to AuditEvent (actorType SYSTEM). */
import { createHmac } from 'crypto';
import { db } from './db';

export type ProducerEventType = 'event.published' | 'event.updated' | 'event.cancelled';

export async function notifyProducer(
  type: ProducerEventType,
  eventId: string,
  workspaceId: string,
): Promise<void> {
  const url = process.env.PRODUCER_WEBHOOK_URL;
  const secret = process.env.PRODUCER_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.warn('[producer-webhook] PRODUCER_WEBHOOK_URL/SECRET not set; skipping notify.');
    return;
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { customQuestions: true },
  });
  if (!event) return;

  const body = JSON.stringify({
    event: type,
    eventId,
    workspaceId,
    timestamp: new Date().toISOString(),
    data: event,
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');

  async function attempt(): Promise<boolean> {
    try {
      const res = await fetch(url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NoBC-Signature': signature },
        body,
      });
      return res.ok;
    } catch (err) {
      console.error('[producer-webhook] delivery error:', err);
      return false;
    }
  }

  let ok = await attempt();
  if (!ok) ok = await attempt(); // one retry on failure

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorType: 'SYSTEM',
      action: ok ? 'producer.notify.delivered' : 'producer.notify.failed',
      entityType: 'EVENT',
      entityId: eventId,
      metadata: { webhookEvent: type },
    },
  });
}
