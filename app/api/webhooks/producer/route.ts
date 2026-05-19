import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';

type ProducerPayload = {
  type: string;
  data: {
    producerEventId: string;
    workspaceId: string;
    title?: string;
    slug?: string;
    description?: string | null;
    startDatetime?: string;
    endDatetime?: string | null;
    venue?: string | null;
    capacity?: number | null;
  };
};

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.PRODUCER_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[producer-webhook] PRODUCER_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get('x-nobc-signature');

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: ProducerPayload;
  try {
    payload = JSON.parse(body) as ProducerPayload;
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  const { type, data } = payload;
  if (!data?.producerEventId || !data?.workspaceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    if (type === 'event.published' || type === 'event.updated') {
      if (!data.title || !data.slug || !data.startDatetime) {
        return NextResponse.json({ error: 'Missing event fields' }, { status: 400 });
      }

      await db.event.upsert({
        where: { producerEventId: data.producerEventId },
        update: {
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          startAt: new Date(data.startDatetime),
          endAt: data.endDatetime ? new Date(data.endDatetime) : null,
          location: data.venue ?? null,
          capacity: data.capacity ?? null,
          status: 'PUBLISHED',
        },
        create: {
          producerEventId: data.producerEventId,
          workspaceId: data.workspaceId,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          startAt: new Date(data.startDatetime),
          endAt: data.endDatetime ? new Date(data.endDatetime) : null,
          location: data.venue ?? null,
          capacity: data.capacity ?? null,
          status: 'PUBLISHED',
        },
      });

      const synced = await db.event.findUnique({
        where: { producerEventId: data.producerEventId },
        select: { id: true },
      });

      await emitEvent({
        workspaceId: data.workspaceId,
        actorType: 'SYSTEM',
        action: 'producer.event.synced',
        entityType: 'Event',
        entityId: synced?.id ?? data.producerEventId,
        metadata: { eventType: type, producerEventId: data.producerEventId },
      });
    } else if (type === 'event.cancelled') {
      const event = await db.event.findUnique({
        where: { producerEventId: data.producerEventId },
        select: { id: true, workspaceId: true },
      });

      if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      if (event.workspaceId !== data.workspaceId) {
        return NextResponse.json({ error: 'Workspace mismatch' }, { status: 403 });
      }

      await db.event.update({
        where: { id: event.id },
        data: { status: 'CANCELLED' },
      });

      await emitEvent({
        workspaceId: data.workspaceId,
        actorType: 'SYSTEM',
        action: 'producer.event.synced',
        entityType: 'Event',
        entityId: event.id,
        metadata: { eventType: type, producerEventId: data.producerEventId },
      });
    } else {
      return NextResponse.json({ error: `Unknown event type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[producer-webhook] DB error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
