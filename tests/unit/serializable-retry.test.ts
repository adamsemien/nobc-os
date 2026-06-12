import { describe, it, expect, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { runSerializable } from '@/lib/serializable-retry';

// runSerializable wraps db.$transaction(fn, { isolationLevel: 'Serializable' })
// and retries ONLY on a Postgres serialization failure (Prisma code P2034 —
// "write conflict or deadlock, please retry"). Any other error — including a
// business sentinel thrown inside fn (e.g. the { code: 'FULL' } a full-event
// route throws) — must propagate immediately without a retry.

/** A real PrismaClientKnownRequestError with the serialization-failure code. */
function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('write conflict, please retry', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

/**
 * Minimal fake PrismaClient whose $transaction invokes the callback and returns
 * its value — so a sequence of mock implementations can model retry behavior.
 */
function fakeDb(impl: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>): PrismaClient {
  return { $transaction: impl } as unknown as PrismaClient;
}

describe('runSerializable', () => {
  it('returns the fn result on first-try success (no retry)', async () => {
    const fn = vi.fn(async () => 'ok');
    const tx = vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb({}));
    const db = fakeDb(tx);

    const result = await runSerializable(db, fn, { baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(tx).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a P2034 serialization failure and then succeeds', async () => {
    const fn = vi.fn(async () => 'won-the-race');
    // Fail twice with P2034, succeed on the third attempt.
    const tx = vi
      .fn()
      .mockRejectedValueOnce(p2034())
      .mockRejectedValueOnce(p2034())
      .mockImplementationOnce(async (cb: (t: unknown) => Promise<unknown>) => cb({}));
    const db = fakeDb(tx);

    const result = await runSerializable(db, fn, { maxRetries: 3, baseDelayMs: 0 });

    expect(result).toBe('won-the-race');
    expect(tx).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a business error thrown inside fn', async () => {
    const businessError = Object.assign(new Error('Event is full'), { code: 'FULL' });
    const tx = vi.fn().mockRejectedValue(businessError);
    const db = fakeDb(tx);

    await expect(
      runSerializable(db, async () => 'unreached', { maxRetries: 3, baseDelayMs: 0 }),
    ).rejects.toBe(businessError);

    // Exactly one attempt — the business sentinel is not a P2034, so no retry.
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it('rethrows the serialization failure after retries are exhausted', async () => {
    const conflict = p2034();
    const tx = vi.fn().mockRejectedValue(conflict);
    const db = fakeDb(tx);

    await expect(
      runSerializable(db, async () => 'unreached', { maxRetries: 2, baseDelayMs: 0 }),
    ).rejects.toBe(conflict);

    // 1 initial attempt + 2 retries = 3 calls, then it gives up.
    expect(tx).toHaveBeenCalledTimes(3);
  });

  it('defaults to 3 retries (4 total attempts) when maxRetries is omitted', async () => {
    const tx = vi.fn().mockRejectedValue(p2034());
    const db = fakeDb(tx);

    await expect(
      runSerializable(db, async () => 'unreached', { baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    expect(tx).toHaveBeenCalledTimes(4);
  });

  it('does not retry a non-P2034 PrismaClientKnownRequestError (e.g. P2002)', async () => {
    const uniqueViolation = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const tx = vi.fn().mockRejectedValue(uniqueViolation);
    const db = fakeDb(tx);

    await expect(
      runSerializable(db, async () => 'unreached', { maxRetries: 3, baseDelayMs: 0 }),
    ).rejects.toBe(uniqueViolation);

    expect(tx).toHaveBeenCalledTimes(1);
  });
});
