import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Consent reconciliation Phase 1: bounces and complaints mint SuppressionEntry
// rows through the ONE sanctioned path. Pins the mapping (bounced ->
// HARD_BOUNCE, complained -> SPAM_COMPLAINT), that delivery/open events mint
// nothing, and that a suppression-write failure never fails the webhook.
// Svix verification is mocked pass-through; the signature path is not under
// test here (it predates this build and stays fail-closed).

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  createSuppressionEntry: vi.fn(),
  logEngagementEvent: vi.fn(),
}));

vi.mock('svix', () => ({
  Webhook: class {
    verify(payload: string) {
      return JSON.parse(payload);
    }
  },
}));
vi.mock('@/lib/db', () => ({
  db: { transactionalEmailLog: { findMany: m.findMany, update: m.update } },
}));
vi.mock('@/lib/comms/suppression', () => ({ createSuppressionEntry: m.createSuppressionEntry }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: m.logEngagementEvent }));

import { POST } from '@/app/api/webhooks/resend/route';

const ROW = {
  id: 'log1',
  workspaceId: 'w1',
  memberId: 'm1',
  personId: 'p1',
  to: 'bounce@example.com',
  templateKey: 'ticket_confirmation',
};

function request(event: { type: string; data: Record<string, unknown> }) {
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    body: JSON.stringify(event),
    headers: {
      'svix-id': 'msg_1',
      'svix-timestamp': '1',
      'svix-signature': 'v1,sig',
    },
  });
}

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
  Object.values(m).forEach((fn) => fn.mockReset());
  m.findMany.mockResolvedValue([ROW]);
  m.update.mockResolvedValue(ROW);
  m.createSuppressionEntry.mockResolvedValue(undefined);
});

describe('POST /api/webhooks/resend — suppression writer', () => {
  it('email.bounced mints a HARD_BOUNCE suppression through the sanctioned path', async () => {
    const res = await POST(request({ type: 'email.bounced', data: { email_id: 'em_1', to: [ROW.to] } }));
    expect(res.status).toBe(200);
    expect(m.createSuppressionEntry).toHaveBeenCalledTimes(1);
    expect(m.createSuppressionEntry).toHaveBeenCalledWith({
      workspaceId: 'w1',
      channel: 'EMAIL',
      identifier: ROW.to,
      reason: 'HARD_BOUNCE',
      source: 'resend_webhook',
      memberId: 'm1',
      personId: 'p1',
    });
  });

  it('email.complained mints a SPAM_COMPLAINT suppression', async () => {
    await POST(request({ type: 'email.complained', data: { email_id: 'em_1', to: [ROW.to] } }));
    expect(m.createSuppressionEntry).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'SPAM_COMPLAINT' }),
    );
  });

  it('delivery/open/click events mint NO suppression', async () => {
    for (const type of ['email.delivered', 'email.opened', 'email.clicked']) {
      await POST(request({ type, data: { email_id: 'em_1', to: [ROW.to] } }));
    }
    expect(m.createSuppressionEntry).not.toHaveBeenCalled();
  });

  it('a suppression-write failure is swallowed — the webhook still returns 200', async () => {
    m.createSuppressionEntry.mockRejectedValue(new Error('db down'));
    const res = await POST(request({ type: 'email.bounced', data: { email_id: 'em_1', to: [ROW.to] } }));
    expect(res.status).toBe(200);
  });
});
