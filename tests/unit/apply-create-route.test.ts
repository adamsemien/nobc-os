import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Apply create route — POST /api/apply/membership.
 *
 * Pins the launch-hardening fixes (FULL-AUDIT-2026-06-21 BLOCKER 5 + 2):
 *   - Idempotency: a retry of screen 0 (network timeout before the client gets
 *     the `id`) reuses the existing PENDING application instead of minting a
 *     second row.
 *   - P2002 recovery: if the optional partial-unique index is live and a
 *     concurrent submit races past the findFirst, the create's P2002 is caught
 *     and the existing row is returned — never a 500 to the applicant.
 *   - Rate limit fires before any DB work (429).
 *
 * db, member-identity and the rate limiter are mocked. No real DB calls.
 */

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  wsFindUnique: vi.fn(),
  wsFindMany: vi.fn(),
  appFindFirst: vi.fn(),
  appCreate: vi.fn(),
  answerFindFirst: vi.fn(),
  answerCreate: vi.fn(),
  answerUpdate: vi.fn(),
  resolveMember: vi.fn(),
}));

vi.mock('@/lib/public-rate-limit', () => ({ publicRateLimit: m.rateLimit }));
vi.mock('@/lib/member-identity', () => ({ resolveMember: m.resolveMember }));
vi.mock('@/lib/db', () => ({
  db: {
    workspace: { findUnique: m.wsFindUnique, findMany: m.wsFindMany },
    application: { findFirst: m.appFindFirst, create: m.appCreate },
    applicationAnswer: {
      findFirst: m.answerFindFirst,
      create: m.answerCreate,
      update: m.answerUpdate,
    },
  },
}));

import { POST } from '@/app/api/apply/membership/route';

const post = (body: Record<string, unknown> = { email: 'a@b.com' }) =>
  POST({ headers: { get: () => '1.2.3.4' }, json: async () => body } as never);

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.rateLimit.mockReturnValue({ allowed: true, retryAfterSecs: 0 });
  m.wsFindMany.mockResolvedValue([{ id: 'w1' }]);
  m.appFindFirst.mockResolvedValue(null);
  m.resolveMember.mockResolvedValue({ id: 'mem1' });
  m.appCreate.mockResolvedValue({ id: 'app_new' });
  m.answerFindFirst.mockResolvedValue(null);
  m.answerCreate.mockResolvedValue({});
});

describe('apply create: rate limit', () => {
  it('returns 429 before resolving the workspace', async () => {
    m.rateLimit.mockReturnValue({ allowed: false, retryAfterSecs: 7 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(m.wsFindMany).not.toHaveBeenCalled();
    expect(m.appCreate).not.toHaveBeenCalled();
  });
});

describe('apply create: idempotency (BLOCKER 5)', () => {
  it('reuses an existing PENDING application instead of creating a new one', async () => {
    m.appFindFirst.mockResolvedValue({ id: 'app_existing' });
    const res = await post({ email: 'a@b.com' });
    const body = await res.json();
    expect(body.id).toBe('app_existing');
    expect(m.appCreate).not.toHaveBeenCalled();
    expect(m.resolveMember).not.toHaveBeenCalled(); // short-circuits before mint
  });

  it('creates a fresh application when no PENDING row exists', async () => {
    m.appFindFirst.mockResolvedValue(null);
    const res = await post({ email: 'new@b.com' });
    const body = await res.json();
    expect(body.id).toBe('app_new');
    expect(m.appCreate).toHaveBeenCalledOnce();
  });
});

describe('apply create: P2002 recovery', () => {
  it('returns the raced row instead of 500 when create hits a unique violation', async () => {
    // findFirst on the PENDING guard misses (no row yet), create races and loses.
    m.appFindFirst
      .mockResolvedValueOnce(null) // PENDING guard
      .mockResolvedValueOnce({ id: 'app_raced' }); // post-P2002 re-read
    m.appCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await post({ email: 'race@b.com' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe('app_raced');
  });

  it('returns 500 with a logged error on a non-P2002 create failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.appCreate.mockRejectedValue(new Error('db down'));
    const res = await post({ email: 'boom@b.com' });
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
