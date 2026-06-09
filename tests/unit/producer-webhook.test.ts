import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Producer shares the same Postgres as NoBC OS; a producerEventId is globally
// unique, so a mis-targeted (buggy) Producer payload on the publish/update path
// could rewrite an event attached to another workspace. The cancel branch
// already guards this; the upsert branch must agree (security + backend audit
// WARNING). These tests sign payloads with the real HMAC and assert the guard.

vi.mock('@/lib/db', () => ({
  db: { event: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/emit-event', () => ({ emitEvent: vi.fn(() => Promise.resolve()) }));

import { POST } from '@/app/api/webhooks/producer/route';
import { db } from '@/lib/db';

const SECRET = 'producer_secret_test';

function signedReq(payload: unknown): NextRequest {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return new NextRequest('http://localhost/api/webhooks/producer', {
    method: 'POST',
    body,
    headers: { 'x-nobc-signature': sig },
  });
}

const publish = (workspaceId: string) => ({
  type: 'event.published',
  data: {
    producerEventId: 'pe_1',
    workspaceId,
    title: 'T',
    slug: 's',
    startDatetime: '2026-07-01T18:00:00.000Z',
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRODUCER_WEBHOOK_SECRET = SECRET;
});

describe('producer webhook tenant ownership on publish/update', () => {
  it('rejects a payload that targets an event owned by another workspace (403, no write)', async () => {
    vi.mocked(db.event.findUnique).mockResolvedValueOnce({ workspaceId: 'ws_owner' } as never);
    const res = await POST(signedReq(publish('ws_attacker')));
    expect(res.status).toBe(403);
    expect(db.event.upsert).not.toHaveBeenCalled();
  });

  it('allows an update when the workspace matches', async () => {
    vi.mocked(db.event.findUnique)
      .mockResolvedValueOnce({ workspaceId: 'ws_1' } as never) // ownership check
      .mockResolvedValueOnce({ id: 'evt_1' } as never); // post-upsert id lookup
    const res = await POST(signedReq(publish('ws_1')));
    expect(res.status).toBe(200);
    expect(db.event.upsert).toHaveBeenCalledTimes(1);
  });

  it('creates when the event does not yet exist (no false 403)', async () => {
    vi.mocked(db.event.findUnique)
      .mockResolvedValueOnce(null as never) // no existing row
      .mockResolvedValueOnce({ id: 'evt_new' } as never);
    const res = await POST(signedReq(publish('ws_1')));
    expect(res.status).toBe(200);
    expect(db.event.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('signature gate (unchanged)', () => {
  it('rejects an invalid signature with 401 before any DB work', async () => {
    const r = new NextRequest('http://localhost/api/webhooks/producer', {
      method: 'POST',
      body: JSON.stringify(publish('ws_1')),
      headers: { 'x-nobc-signature': 'deadbeef' },
    });
    const res = await POST(r);
    expect(res.status).toBe(401);
    expect(db.event.findUnique).not.toHaveBeenCalled();
  });
});
