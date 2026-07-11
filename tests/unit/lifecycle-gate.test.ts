import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { gateLifecycleEmail } from '@/lib/comms/lifecycle-gate';

// Pins the event-comms suppression gate's fail-closed guarantees:
//  1. No destination -> never sends.
//  2. A SuppressionEntry for the normalized identifier -> never sends,
//     transactional or not.
//  3. An ERROR during the suppression lookup -> never sends (opposite of
//     evaluateConsent's fail-open, by design).
//  4. The shadow evaluateConsent probe can never block: a member with NO
//     ChannelSubscription row (canSend would say "block") still sends,
//     because lifecycle email is transactional-exempt beyond suppression.

type Stub = {
  suppression?: unknown;
  suppressionError?: Error;
};

function stubDb(cfg: Stub = {}) {
  const suppressionFindUnique = cfg.suppressionError
    ? vi.fn().mockRejectedValue(cfg.suppressionError)
    : vi.fn().mockResolvedValue(cfg.suppression ?? null);
  const db = {
    suppressionEntry: { findUnique: suppressionFindUnique },
    // The shadow probe's canSend consults this; always "no row" here.
    channelSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  return { db, suppressionFindUnique };
}

describe('gateLifecycleEmail', () => {
  it('fails closed when there is no destination', async () => {
    const { db, suppressionFindUnique } = stubDb();
    const result = await gateLifecycleEmail(
      { workspaceId: 'ws1', email: '   ', site: 'test' },
      db,
    );
    expect(result).toEqual({ send: false, reason: 'no_destination' });
    expect(suppressionFindUnique).not.toHaveBeenCalled();
  });

  it('blocks a suppressed identifier, looked up by the normalized email', async () => {
    const { db, suppressionFindUnique } = stubDb({ suppression: { reason: 'UNSUBSCRIBE' } });
    const result = await gateLifecycleEmail(
      { workspaceId: 'ws1', email: '  Adam@Example.COM ', site: 'test' },
      db,
    );
    expect(result).toEqual({ send: false, reason: 'suppressed' });
    expect(suppressionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_channel_identifier: {
            workspaceId: 'ws1',
            channel: 'EMAIL',
            identifier: 'adam@example.com',
          },
        },
      }),
    );
  });

  it('fails CLOSED when the suppression lookup errors', async () => {
    const { db } = stubDb({ suppressionError: new Error('db down') });
    const result = await gateLifecycleEmail(
      { workspaceId: 'ws1', email: 'adam@example.com', site: 'test' },
      db,
    );
    expect(result).toEqual({ send: false, reason: 'suppression_check_failed' });
  });

  it('allows a clean identifier and returns the normalized email', async () => {
    const { db } = stubDb();
    const result = await gateLifecycleEmail(
      { workspaceId: 'ws1', email: ' Adam@Example.COM ', site: 'test' },
      db,
    );
    expect(result).toEqual({ send: true, email: 'adam@example.com' });
  });

  it('is never blocked by the shadow consent probe (no ChannelSubscription row)', async () => {
    const { db } = stubDb();
    // memberId present -> the shadow probe runs; canSend would return false
    // (no SUBSCRIBED row), but that verdict must be discarded.
    const result = await gateLifecycleEmail(
      { workspaceId: 'ws1', email: 'adam@example.com', memberId: 'm1', site: 'test' },
      db,
    );
    expect(result).toEqual({ send: true, email: 'adam@example.com' });
  });
});
