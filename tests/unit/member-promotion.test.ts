import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { findFirst, create, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { member: { findFirst, create, update } } }));
vi.mock('@/lib/member-qr', () => ({ generateMemberQrCode: () => 'qr_fixed_token' }));

import { promoteMemberToApproved } from '@/lib/member-identity';

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  update.mockReset();
});

describe('promoteMemberToApproved — same row, no new person', () => {
  it('flips an existing GUEST row to APPROVED in place (same id, history preserved)', async () => {
    update.mockResolvedValue({
      id: 'm_same', workspaceId: 'w1', email: 'g@example.com', firstName: 'G', lastName: '',
      status: 'APPROVED', approved: true, memberQrCode: 'kept_qr', phone: null,
    });

    const m = await promoteMemberToApproved('m_same');

    // Promotes the SAME row by id — never creates a new member.
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0].where).toEqual({ id: 'm_same' });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', approved: true });
    expect(m.id).toBe('m_same');
    expect(m.memberQrCode).toBe('kept_qr');
  });

  it('backfills a missing QR while promoting (QR law)', async () => {
    update
      .mockResolvedValueOnce({
        id: 'm_noqr', workspaceId: 'w1', email: 'h@example.com', firstName: 'H', lastName: '',
        status: 'APPROVED', approved: true, memberQrCode: null, phone: null,
      })
      .mockResolvedValueOnce({
        id: 'm_noqr', workspaceId: 'w1', email: 'h@example.com', firstName: 'H', lastName: '',
        status: 'APPROVED', approved: true, memberQrCode: 'qr_fixed_token', phone: null,
      });

    const m = await promoteMemberToApproved('m_noqr');
    expect(m.memberQrCode).toBe('qr_fixed_token');
  });
});

// Source-level guard: identity is linked at submission, not only at approval.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('Application.memberId is linked at submission', () => {
  it('public apply (/apply/[slug]) resolves a member and sets memberId', () => {
    const src = read('app/api/apply/[slug]/route.ts');
    expect(src).toContain('resolveMember');
    expect(src).toMatch(/memberId:\s*applicantMember\.id/);
  });

  it('membership apply (/apply/membership) mints a Person at draft, not a guest Member', () => {
    // Campaign 1 item 2: People is the first-touch surface; the Member mints at
    // submit (Door 1) or approval, never at draft.
    const src = read('app/api/apply/membership/route.ts');
    expect(src).toContain('resolvePerson');
    expect(src).not.toContain('resolveMember');
    expect(src).not.toMatch(/memberId:\s*member\.id/);
  });

  it('the approval gate now also sets Application.memberId', () => {
    const src = read('lib/applications/approve.ts');
    expect(src).toMatch(/memberId:\s*resolved\.id/);
  });
});
