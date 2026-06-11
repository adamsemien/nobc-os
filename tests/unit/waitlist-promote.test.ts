import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Waitlist auto-promote race regression (audit: non-transactional counters).
 *
 * promoteFromWaitlist used to find-then-update with no transaction: two
 * concurrent cancels both picked the same entry, double-notified it, and the
 * second freed seat never reached the next person. Contract under test:
 * - the claim (findFirst + update) runs inside ONE db.$transaction holding
 *   the Event row lock (SELECT ... FOR UPDATE), so promotes serialize and
 *   each one claims a DISTINCT entry;
 * - email I/O happens OUTSIDE the transaction (never hold a row lock across
 *   a network call);
 * - cancelRsvp only audits + promotes when its update actually flipped the
 *   row, so a double-cancel can't promote two people for one freed seat.
 */

const {
  eventFindUnique,
  entryFindFirst,
  entryUpdate,
  rsvpFindFirst,
  rsvpUpdateMany,
  auditCreate,
  txQueryRaw,
  dbTransaction,
  resendSend,
} = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  entryFindFirst: vi.fn(),
  entryUpdate: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  txQueryRaw: vi.fn(),
  dbTransaction: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    event: { findUnique: eventFindUnique },
    rSVP: { findFirst: rsvpFindFirst, updateMany: rsvpUpdateMany },
    auditEvent: { create: auditCreate },
    $transaction: dbTransaction,
  },
}));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: resendSend } } }));
vi.mock('@/lib/email-templates', () => ({
  waitlistPromotedEmail: (name: string, title: string, slug: string) => ({
    subject: `A spot opened for ${title}`,
    html: `<p>${name} — ${slug}</p>`,
  }),
}));

import { promoteFromWaitlist, cancelRsvp } from '@/lib/waitlist';

// The client handed to the $transaction callback. Distinct fns from the
// db-level ones so the tests can prove the claim ran on the transaction.
const tx = {
  $queryRaw: txQueryRaw,
  waitlistEntry: { findFirst: entryFindFirst, update: entryUpdate },
};

const event = { id: 'ev1', title: 'Listening Dinner', slug: 'listening-dinner', workspaceId: 'ws1' };
const entry1 = { id: 'wl1', email: 'ana@example.com', name: 'Ana Lee', position: 1 };
const entry2 = { id: 'wl2', email: 'bo@example.com', name: 'Bo Park', position: 2 };

let txOpen = false;

beforeEach(() => {
  for (const fn of [
    eventFindUnique, entryFindFirst, entryUpdate, rsvpFindFirst,
    rsvpUpdateMany, auditCreate, txQueryRaw, dbTransaction, resendSend,
  ]) fn.mockReset();

  txOpen = false;
  dbTransaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => {
    txOpen = true;
    try {
      return await cb(tx);
    } finally {
      txOpen = false;
    }
  });
  eventFindUnique.mockResolvedValue(event);
  entryFindFirst.mockResolvedValue(null);
  entryUpdate.mockResolvedValue({});
  txQueryRaw.mockResolvedValue([]);
  resendSend.mockResolvedValue({ id: 'email1' });
  auditCreate.mockResolvedValue({ id: 'a1' });
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('promoteFromWaitlist — atomic claim', () => {
  it('claims the next unnotified entry inside the transaction and notifies them', async () => {
    entryFindFirst.mockResolvedValue(entry1);
    const before = Date.now();

    await promoteFromWaitlist('ev1');

    expect(dbTransaction).toHaveBeenCalledOnce();

    // The Event row lock is taken FIRST, inside the transaction.
    expect(txQueryRaw).toHaveBeenCalledOnce();
    const [strings, param] = txQueryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(param).toBe('ev1');
    expect(txQueryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      entryFindFirst.mock.invocationCallOrder[0],
    );

    // Lowest unnotified position, workspace-scoped.
    expect(entryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventId: 'ev1', workspaceId: 'ws1', notifiedAt: null }),
        orderBy: { position: 'asc' },
      }),
    );

    // Claim sets notifiedAt now and a ~24h expiry.
    expect(entryUpdate).toHaveBeenCalledOnce();
    const update = entryUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'wl1' });
    expect(update.data.notifiedAt).toBeInstanceOf(Date);
    const expiresMs = (update.data.expiresAt as Date).getTime() - before;
    expect(expiresMs).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(expiresMs).toBeLessThan(24.1 * 60 * 60 * 1000);

    // Locked from-address, correct recipient.
    expect(resendSend).toHaveBeenCalledOnce();
    expect(resendSend.mock.calls[0][0]).toMatchObject({
      from: 'NoBC <team@thenobadcompany.com>',
      to: 'ana@example.com',
    });
  });

  it('sends the email OUTSIDE the transaction (no row lock across network I/O)', async () => {
    entryFindFirst.mockResolvedValue(entry1);
    let emailDuringTx: boolean | null = null;
    resendSend.mockImplementation(async () => {
      emailDuringTx = txOpen;
      return { id: 'e' };
    });

    await promoteFromWaitlist('ev1');

    expect(emailDuringTx).toBe(false);
  });

  it('two promotes claim DISTINCT entries — the double-cancel double-notify is gone', async () => {
    // Serialized by the row lock, the second findFirst sees entry1 already
    // claimed and returns entry2.
    entryFindFirst.mockResolvedValueOnce(entry1).mockResolvedValueOnce(entry2);

    await promoteFromWaitlist('ev1');
    await promoteFromWaitlist('ev1');

    expect(entryUpdate).toHaveBeenCalledTimes(2);
    expect(entryUpdate.mock.calls.map(c => c[0].where.id)).toEqual(['wl1', 'wl2']);
    expect(resendSend.mock.calls.map(c => c[0].to)).toEqual([
      'ana@example.com',
      'bo@example.com',
    ]);
  });

  it('empty waitlist: claims nothing, emails nobody', async () => {
    await promoteFromWaitlist('ev1');
    expect(entryUpdate).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('unknown event: does nothing', async () => {
    eventFindUnique.mockResolvedValue(null);
    await promoteFromWaitlist('nope');
    expect(dbTransaction).not.toHaveBeenCalled();
  });

  it('without RESEND_API_KEY the claim still happens, the email is skipped', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    entryFindFirst.mockResolvedValue(entry1);

    await promoteFromWaitlist('ev1');

    expect(entryUpdate).toHaveBeenCalledOnce();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('a failing email send never throws (claim already committed)', async () => {
    entryFindFirst.mockResolvedValue(entry1);
    resendSend.mockRejectedValue(new Error('resend down'));

    await expect(promoteFromWaitlist('ev1')).resolves.toBeUndefined();
    expect(entryUpdate).toHaveBeenCalledOnce();
  });
});

describe('cancelRsvp — idempotent seat release', () => {
  const rsvp = { id: 'r1', eventId: 'ev1', workspaceId: 'ws1' };

  beforeEach(() => {
    rsvpFindFirst.mockResolvedValue(rsvp);
    rsvpUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects an unknown or cross-workspace RSVP', async () => {
    rsvpFindFirst.mockResolvedValue(null);
    await expect(cancelRsvp('r1', 'ws-other')).rejects.toThrow('RSVP not found');
    expect(rsvpFindFirst).toHaveBeenCalledWith({ where: { id: 'r1', workspaceId: 'ws-other' } });
    expect(rsvpUpdateMany).not.toHaveBeenCalled();
  });

  it('cancels conditionally, audits, then promotes from the waitlist', async () => {
    await cancelRsvp('r1', 'ws1');

    // The flip is guarded so only a real transition releases the seat.
    expect(rsvpUpdateMany).toHaveBeenCalledWith({
      where: { id: 'r1', workspaceId: 'ws1', ticketStatus: { not: 'cancelled' } },
      data: { ticketStatus: 'cancelled', status: 'DECLINED' },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'ws1',
      action: 'rsvp.cancelled',
      entityId: 'r1',
    });
    // promoteFromWaitlist ran for the freed seat's event.
    expect(eventFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ev1' } }),
    );
  });

  it('a second cancel of the same RSVP is a no-op — one seat, one promotion', async () => {
    rsvpUpdateMany.mockResolvedValue({ count: 0 });

    await cancelRsvp('r1', 'ws1');

    expect(auditCreate).not.toHaveBeenCalled();
    expect(eventFindUnique).not.toHaveBeenCalled();
    expect(dbTransaction).not.toHaveBeenCalled();
  });
});
