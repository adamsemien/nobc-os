import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Approve-guard (Data Integrity Build A) — lib/applications/approve.ts.
 *
 * approveApplication() is THE one approve path (operator route, bulk route,
 * agent tool, MCP tool all delegate to it), so this guard is the real safety
 * boundary — the ConfirmModal in the UI is UX only. Pins:
 *   - submittedAt === null → { ok:false, error:'not_submitted' }, no member
 *     resolution, no status write (a draft can't be approved by accident).
 *   - allowUnsubmitted: true → proceeds (the single-approve route's explicit
 *     "Approve anyway" confirmation is the only caller that passes it).
 *   - submittedAt set → guard is silent, normal approve proceeds.
 *   - already_approved still wins over not_submitted (replay stays a 409).
 */

const m = vi.hoisted(() => ({
  appFindUnique: vi.fn(),
  appUpdate: vi.fn(),
  memberFindUnique: vi.fn(),
  memberUpdate: vi.fn(),
  rsvpFindFirst: vi.fn(),
  rsvpUpdate: vi.fn(),
  resolveMember: vi.fn(),
  emitEvent: vi.fn(),
  syncConsent: vi.fn(),
  welcomeEmail: vi.fn(),
  generateMemberPass: vi.fn(),
  emailSend: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    application: { findUnique: m.appFindUnique, update: m.appUpdate },
    member: { findUnique: m.memberFindUnique, update: m.memberUpdate },
    rSVP: { findFirst: m.rsvpFindFirst, update: m.rsvpUpdate },
    // approve.ts uses the array form — resolve every queued promise together.
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock('@/lib/member-identity', () => ({ resolveMember: m.resolveMember }));
vi.mock('@/lib/active-event', () => ({ ACTIVE_EVENT_ID: 'evt1' }));
vi.mock('@/lib/emit-event', () => ({ emitEvent: m.emitEvent }));
vi.mock('@/lib/comms/consent-sync', () => ({ syncMemberChannelConsent: m.syncConsent }));
vi.mock('@/lib/email-templates', () => ({ welcomeEmail: m.welcomeEmail }));
vi.mock('@/lib/wallet-pass', () => ({ generateMemberPass: m.generateMemberPass }));
vi.mock('@/lib/resend', () => ({ resend: { emails: { send: m.emailSend } } }));

import { approveApplication } from '@/lib/applications/approve';

const draftApp = {
  id: 'app1',
  workspaceId: 'w1',
  email: 'a@b.com',
  phone: null,
  fullName: 'Draft Person',
  status: 'PENDING',
  submittedAt: null,
};

beforeEach(() => {
  Object.values(m).forEach(fn => fn.mockReset());
  m.memberFindUnique.mockResolvedValue(null);
  m.resolveMember.mockResolvedValue({ id: 'mem1' });
  m.appUpdate.mockResolvedValue({ id: 'app1', status: 'APPROVED' });
  m.memberUpdate.mockResolvedValue({ id: 'mem1', status: 'APPROVED' });
  m.rsvpFindFirst.mockResolvedValue(null);
  m.emitEvent.mockResolvedValue(undefined);
  m.syncConsent.mockResolvedValue(undefined);
  m.welcomeEmail.mockReturnValue({ subject: 's', html: '<p>h</p>' });
  m.emailSend.mockResolvedValue({ data: { id: 'e1' } });
});

const params = { applicationId: 'app1', workspaceId: 'w1', actorId: 'op1' };

describe('approve-guard: null submittedAt', () => {
  it('refuses a never-submitted draft with not_submitted and writes nothing', async () => {
    m.appFindUnique.mockResolvedValue({ ...draftApp });
    const outcome = await approveApplication(params);
    expect(outcome).toEqual({ ok: false, error: 'not_submitted' });
    expect(m.resolveMember).not.toHaveBeenCalled();
    expect(m.appUpdate).not.toHaveBeenCalled();
    expect(m.memberUpdate).not.toHaveBeenCalled();
    expect(m.emailSend).not.toHaveBeenCalled();
  });

  it('proceeds when allowUnsubmitted is explicitly passed', async () => {
    m.appFindUnique.mockResolvedValue({ ...draftApp });
    const outcome = await approveApplication({ ...params, allowUnsubmitted: true });
    expect(outcome.ok).toBe(true);
    expect(m.appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('already_approved still wins over not_submitted on replay', async () => {
    m.appFindUnique.mockResolvedValue({ ...draftApp, status: 'APPROVED' });
    const outcome = await approveApplication(params);
    expect(outcome).toEqual({ ok: false, error: 'already_approved' });
  });
});

describe('approve-guard: submitted application', () => {
  it('is silent for a genuinely submitted application', async () => {
    m.appFindUnique.mockResolvedValue({ ...draftApp, submittedAt: new Date('2026-07-01') });
    const outcome = await approveApplication(params);
    expect(outcome.ok).toBe(true);
    expect(m.appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });
});
