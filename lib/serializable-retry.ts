import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Run an interactive transaction at the Serializable isolation level, retrying
 * on Postgres serialization failures.
 *
 * Every money-path transaction in this repo runs at `Serializable` so the
 * capacity count + RSVP write are one atomic, conflict-free unit. The tradeoff
 * is that Postgres aborts one of two genuinely-concurrent serializable
 * transactions with a serialization failure — surfaced by Prisma as a
 * `PrismaClientKnownRequestError` with code `P2034` ("Transaction failed due to
 * a write conflict or a deadlock. Please retry your transaction"). Without a
 * retry, last-seat contention turns a recoverable conflict into a user-facing
 * 500. This helper retries P2034 a few times with a small backoff so the loser
 * of the race simply re-runs against the committed state (and then correctly
 * sees the event full / seat taken via the in-transaction re-check).
 *
 * Only P2034 is retried. A business error thrown inside `fn` (e.g. the
 * `code: 'FULL'` sentinel the guest checkout routes throw to signal a full
 * event) is a plain `Error`, not a `PrismaClientKnownRequestError`, so it
 * propagates immediately and is never retried.
 */

const PRISMA_SERIALIZATION_FAILURE = 'P2034';

export interface RunSerializableOptions {
  /** Total attempts = 1 initial + `maxRetries` retries. Default 3. */
  maxRetries?: number;
  /** Base backoff in ms; attempt N waits `baseDelayMs * N`. Default 25. */
  baseDelayMs?: number;
}

function isSerializationFailure(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === PRISMA_SERIALIZATION_FAILURE
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Drop-in replacement for `db.$transaction(fn, { isolationLevel: 'Serializable' })`
 * that retries the transaction on a P2034 serialization failure.
 *
 * @param db   Prisma client instance.
 * @param fn   Interactive-transaction callback. Receives the transactional client.
 * @param opts Retry tuning (see `RunSerializableOptions`).
 */
export async function runSerializable<T>(
  db: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: RunSerializableOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 25;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (err) {
      // Only serialization failures are retryable — every other error
      // (including business sentinels thrown by `fn`) propagates immediately.
      if (!isSerializationFailure(err)) throw err;
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(baseDelayMs * (attempt + 1));
      }
    }
  }
  // Retries exhausted on a serialization failure — rethrow the last one.
  throw lastError;
}
