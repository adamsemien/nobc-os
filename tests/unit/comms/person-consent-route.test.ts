import { describe, it, expect, vi, beforeEach } from 'vitest';

// The operator Person consent route (consent reconciliation, Phase 1). Pins
// locked decision 2: Unsubscribe is marketing-only and goes through THE
// consent writer WITHOUT minting a SuppressionEntry; Block is the distinct
// hard action that mints MANUAL_BLOCK through the sanctioned suppression path
// with the normalized channel identifier.

const m = vi.hoisted(() => ({
  requireRole: vi.fn(),
  personFindFirst: vi.fn(),
  memberFindFirst: vi.fn(),
  writeConsent: vi.fn(),
  createSuppressionEntry: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock('@/lib/operator-role', () => ({ requireRole: m.requireRole }));
vi.mock('@/lib/db', () => ({
  db: { person: { findFirst: m.personFindFirst }, member: { findFirst: m.memberFindFirst } },
}));
vi.mock('@/lib/comms/consent-writer', () => ({ writeConsent: m.writeConsent }));
vi.mock('@/lib/comms/suppression', () => ({ createSuppressionEntry: m.createSuppressionEntry }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));

import { PATCH } from '@/app/api/operator/people/[id]/consent/route';

const PERSON = { id: 'p1', workspaceId: 'w1', mergedIntoId: null, email: ' Adam@Example.COM ', phone: '+15550001111' };

function patch(body: unknown) {
  return PATCH({ json: async () => body } as never, { params: Promise.resolve({ id: 'p1' }) });
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requireRole.mockResolvedValue({ ok: true, userId: 'op1', workspaceId: 'w1' });
  m.personFindFirst.mockResolvedValue(PERSON);
  m.memberFindFirst.mockResolvedValue({ id: 'm1' });
  m.writeConsent.mockResolvedValue({ changed: true, status: 'UNSUBSCRIBED' });
  m.createSuppressionEntry.mockResolvedValue(undefined);
  m.emitEvent.mockResolvedValue(undefined);
});

describe('PATCH /api/operator/people/[id]/consent', () => {
  it('Unsubscribe goes through the writer in explicit mode and mints NO suppression (decision 2)', async () => {
    const res = await patch({ channel: 'EMAIL', status: 'UNSUBSCRIBED' });
    expect(res.status).toBe(200);
    expect(m.writeConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        personId: 'p1',
        mode: 'explicit',
        signal: expect.objectContaining({ channel: 'EMAIL', status: 'UNSUBSCRIBED', basis: 'OPERATOR_ADDED' }),
      }),
    );
    expect(m.createSuppressionEntry).not.toHaveBeenCalled();
  });

  it('Subscribe also routes through the writer (explicit re-subscribe is lawful)', async () => {
    m.writeConsent.mockResolvedValue({ changed: true, status: 'SUBSCRIBED' });
    const res = await patch({ channel: 'SMS', status: 'SUBSCRIBED' });
    expect(res.status).toBe(200);
    expect(m.writeConsent).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.objectContaining({ status: 'SUBSCRIBED' }) }),
    );
  });

  it('Block mints MANUAL_BLOCK via the sanctioned path with the normalized identifier', async () => {
    const res = await patch({ channel: 'EMAIL', action: 'BLOCK' });
    expect(res.status).toBe(200);
    expect(m.createSuppressionEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        channel: 'EMAIL',
        identifier: 'adam@example.com', // lowercased + trimmed by channelIdentifier
        reason: 'MANUAL_BLOCK',
        personId: 'p1',
        memberId: 'm1',
      }),
    );
    expect(m.writeConsent).not.toHaveBeenCalled();
  });

  it('Block on a channel with no destination fails honestly with 400', async () => {
    m.personFindFirst.mockResolvedValue({ ...PERSON, phone: null });
    const res = await patch({ channel: 'SMS', action: 'BLOCK' });
    expect(res.status).toBe(400);
    expect(m.createSuppressionEntry).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const res = await patch({ channel: 'EMAIL', status: 'CLEANED' });
    expect(res.status).toBe(400);
    expect(m.writeConsent).not.toHaveBeenCalled();
  });
});
