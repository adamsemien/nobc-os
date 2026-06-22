import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Apply submit route — /api/apply/membership/[id]/submit.
 *
 * Pins the launch-hardening fixes (FULL-AUDIT-2026-06-21 BLOCKER 3):
 *   - Idempotency: a replay of an already-scored application is a no-op that
 *     returns the persisted reveal shape from the row — it does NOT re-run the
 *     two billed Sonnet calls (scoreApplication + generateText) or re-send email.
 *   - A REJECTED row (BLOCKED auto-reject already ran) replays as {blocked:true}.
 *   - Rate limit fires before any DB work (429).
 *   - Branch coverage: 404 unknown id, 409 duplicate, BLOCKED auto-reject,
 *     PURPLE auto-approve + welcome email, happy path → archetype reveal.
 *
 * db, resend, ai, scoring, watchlist, member-identity, slack, backup and the
 * rate limiter are all mocked. No real Anthropic / Resend / DB calls.
 */

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  appFindUnique: vi.fn(),
  appUpdate: vi.fn(),
  auditCreate: vi.fn(),
  checkDuplicate: vi.fn(),
  checkWatchList: vi.fn(),
  scoreApplication: vi.fn(),
  generateText: vi.fn(),
  resolveMember: vi.fn(),
  promoteMemberToApproved: vi.fn(),
  maybeFireSlack: vi.fn(),
  backupApplication: vi.fn(),
  emailSend: vi.fn(),
  render: vi.fn(),
}));

vi.mock('@/lib/public-rate-limit', () => ({ publicRateLimit: m.rateLimit }));
vi.mock('@/lib/db', () => ({
  db: {
    application: { findUnique: m.appFindUnique, update: m.appUpdate },
    auditEvent: { create: m.auditCreate },
  },
}));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: m.emailSend } } }));
vi.mock('ai', () => ({ generateText: m.generateText }));
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => 'model' }));
vi.mock('@/lib/scoring', () => ({ scoreApplication: m.scoreApplication }));
vi.mock('@/lib/watchlist', () => ({
  checkDuplicate: m.checkDuplicate,
  checkWatchList: m.checkWatchList,
}));
vi.mock('@/lib/member-identity', () => ({
  resolveMember: m.resolveMember,
  promoteMemberToApproved: m.promoteMemberToApproved,
}));
vi.mock('@/lib/comments-notify', () => ({ maybeFireSlack: m.maybeFireSlack }));
vi.mock('@/lib/applications/backup', () => ({ backupApplication: m.backupApplication }));
vi.mock('@react-email/render', () => ({ render: m.render }));
vi.mock('@/emails/WelcomeEmail', () => ({ default: () => null }));

// after() runs the callback synchronously enough for assertions; we don't assert on it here.
vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>();
  return { ...actual, after: (cb: () => void) => { void cb; } };
});

import { POST } from '@/app/api/apply/membership/[id]/submit/route';

const post = (id = 'app1') =>
  POST({ headers: { get: () => '1.2.3.4' } } as never, { params: Promise.resolve({ id }) });

const baseApp = {
  id: 'app1',
  workspaceId: 'w1',
  email: 'a@b.com',
  phone: null,
  fullName: 'Test Person',
  status: 'PENDING',
  aiScore: null,
  archetype: null,
  archetypeScores: null,
  aiTags: [],
  personalizedCopy: null,
  answers: [{ questionKey: 'q1', answer: 'hello' }],
};

const scoreResult = {
  archetype: 'The Connector',
  archetypeScores: { 'The Connector': 0.8 },
  dimensionScores: {},
  memberWorthTotal: 80,
  tags: ['curious'],
  aiRecommendation: 'APPROVE',
  aiReasoning: 'good fit',
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.rateLimit.mockReturnValue({ allowed: true, retryAfterSecs: 0 });
  m.checkDuplicate.mockResolvedValue(false);
  m.checkWatchList.mockResolvedValue(null);
  m.scoreApplication.mockResolvedValue(scoreResult);
  m.generateText.mockResolvedValue({ text: 'You clearly care.' });
  m.appUpdate.mockResolvedValue({});
  m.auditCreate.mockResolvedValue({});
  m.resolveMember.mockResolvedValue({ id: 'mem1' });
  m.promoteMemberToApproved.mockResolvedValue({ id: 'mem1' });
  m.emailSend.mockResolvedValue({ data: { id: 'e1' } });
  m.render.mockResolvedValue('<html></html>');
});

describe('apply submit: rate limit', () => {
  it('returns 429 before any DB call when the limiter rejects', async () => {
    m.rateLimit.mockReturnValue({ allowed: false, retryAfterSecs: 42 });
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(m.appFindUnique).not.toHaveBeenCalled();
    expect(m.scoreApplication).not.toHaveBeenCalled();
  });
});

describe('apply submit: 404', () => {
  it('returns 404 for an unknown application id', async () => {
    m.appFindUnique.mockResolvedValue(null);
    const res = await post('nope');
    expect(res.status).toBe(404);
    expect(m.scoreApplication).not.toHaveBeenCalled();
  });
});

describe('apply submit: idempotency (BLOCKER 3)', () => {
  it('an already-scored application replays cached, never re-scores or re-emails', async () => {
    m.appFindUnique.mockResolvedValue({
      ...baseApp,
      aiScore: 0.8,
      archetype: 'The Connector',
      archetypeScores: { 'The Connector': 0.8 },
      aiTags: ['curious'],
      personalizedCopy: 'You clearly care.',
    });

    const res = await post();
    const body = await res.json();

    expect(body.cached).toBe(true);
    expect(body.archetype).toBe('The Connector');
    expect(body.archetypeScores).toEqual({ 'The Connector': 0.8 });
    expect(body.tags).toEqual(['curious']);
    expect(body.personalizedCopy).toBe('You clearly care.');

    // The expensive / side-effecting work must NOT run on replay.
    expect(m.scoreApplication).not.toHaveBeenCalled();
    expect(m.generateText).not.toHaveBeenCalled();
    expect(m.emailSend).not.toHaveBeenCalled();
    expect(m.appUpdate).not.toHaveBeenCalled();
  });

  it('a REJECTED row (BLOCKED already ran) replays as blocked, no re-scoring', async () => {
    m.appFindUnique.mockResolvedValue({ ...baseApp, status: 'REJECTED', aiScore: null });
    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ blocked: true, cached: true });
    expect(m.scoreApplication).not.toHaveBeenCalled();
    expect(m.checkWatchList).not.toHaveBeenCalled();
  });
});

describe('apply submit: duplicate (409)', () => {
  it('returns 409 and never scores when checkDuplicate is true', async () => {
    m.appFindUnique.mockResolvedValue({ ...baseApp });
    m.checkDuplicate.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(409);
    expect(m.scoreApplication).not.toHaveBeenCalled();
  });
});

describe('apply submit: BLOCKED auto-reject', () => {
  it('flips status to REJECTED and returns {blocked:true} without scoring', async () => {
    m.appFindUnique.mockResolvedValue({ ...baseApp });
    m.checkWatchList.mockResolvedValue({ type: 'BLOCKED', entryId: 'wl1' });
    const res = await post();
    const body = await res.json();
    expect(body).toEqual({ blocked: true });
    expect(m.appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
    );
    expect(m.scoreApplication).not.toHaveBeenCalled();
  });
});

describe('apply submit: PURPLE auto-approve', () => {
  it('approves, sends welcome email from the locked sender, then scores', async () => {
    m.appFindUnique.mockResolvedValue({ ...baseApp });
    m.checkWatchList.mockResolvedValue({ type: 'PURPLE', entryId: 'wl2' });
    const res = await post();
    const body = await res.json();

    expect(m.promoteMemberToApproved).toHaveBeenCalled();
    expect(m.emailSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'The No Bad Company <team@thenobadcompany.com>' }),
    );
    // Falls through to scoring so the archetype is still computed.
    expect(m.scoreApplication).toHaveBeenCalled();
    expect(body.archetype).toBe('The Connector');
  });
});

describe('apply submit: happy path', () => {
  it('scores, persists, and returns the archetype reveal shape', async () => {
    m.appFindUnique.mockResolvedValue({ ...baseApp });
    const res = await post();
    const body = await res.json();

    expect(m.scoreApplication).toHaveBeenCalledWith('app1');
    expect(m.appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archetype: 'The Connector', aiScore: 0.8 }),
      }),
    );
    expect(body.archetype).toBe('The Connector');
    expect(body.tags).toEqual(['curious']);
    expect(body.personalizedCopy).toBe('You clearly care.');
    expect(m.emailSend).not.toHaveBeenCalled(); // no email on normal submit
  });
});
