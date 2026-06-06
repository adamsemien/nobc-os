import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma singleton and the QR mint so resolveMember can be exercised
// without a database. We assert on the exact `data` passed to member.create.
const { findFirst, create, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { member: { findFirst, create, update } } }));
vi.mock('@/lib/member-qr', () => ({ generateMemberQrCode: () => 'qr_fixed_token' }));

import { resolveMember } from '@/lib/member-identity';

beforeEach(() => {
  findFirst.mockReset();
  create.mockReset();
  update.mockReset();
});

describe('resolveMember — invariants', () => {
  it('mints a new member as GUEST, never APPROVED', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));

    await resolveMember({ workspaceId: 'w1', email: 'A@Example.com', name: 'Ada Lovelace', source: 'plus_one' });

    expect(create).toHaveBeenCalledOnce();
    const { data } = create.mock.calls[0][0];
    expect(data.status).toBe('GUEST');
    expect(data.approved).toBe(false);
  });

  it('ALWAYS mints a memberQrCode on create (QR law)', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));

    await resolveMember({ workspaceId: 'w1', email: 'b@example.com', source: 'apply' });

    expect(create.mock.calls[0][0].data.memberQrCode).toBe('qr_fixed_token');
  });

  it('normalizes email and falls back to a guest:<email> clerkUserId', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));

    await resolveMember({ workspaceId: 'w1', email: '  Mixed@Case.COM ', source: 'walkin' });

    const { data } = create.mock.calls[0][0];
    expect(data.email).toBe('mixed@case.com');
    expect(data.clerkUserId).toBe('guest:mixed@case.com');
  });

  it('uses the provided clerkUserId when present', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));

    await resolveMember({ workspaceId: 'w1', email: 'c@example.com', clerkUserId: 'user_123', source: 'apply' });

    expect(create.mock.calls[0][0].data.clerkUserId).toBe('user_123');
  });

  it('returns the existing canonical row without creating a duplicate', async () => {
    findFirst.mockResolvedValue({
      id: 'existing', workspaceId: 'w1', email: 'd@example.com', firstName: 'D', lastName: '',
      status: 'APPROVED', approved: true, memberQrCode: 'already', phone: null,
    });

    const m = await resolveMember({ workspaceId: 'w1', email: 'd@example.com', source: 'checkout' });

    expect(create).not.toHaveBeenCalled();
    expect(m.id).toBe('existing');
    // Resolving an already-APPROVED person never demotes them.
    expect(m.status).toBe('APPROVED');
  });

  it('backfills a missing memberQrCode on an existing row (QR law on lookup)', async () => {
    findFirst.mockResolvedValue({
      id: 'old', workspaceId: 'w1', email: 'e@example.com', firstName: 'E', lastName: '',
      status: 'GUEST', approved: false, memberQrCode: null, phone: null,
    });
    update.mockImplementation(({ data }) => Promise.resolve({ id: 'old', memberQrCode: data.memberQrCode, status: 'GUEST', approved: false, workspaceId: 'w1', email: 'e@example.com', firstName: 'E', lastName: '', phone: null }));

    const m = await resolveMember({ workspaceId: 'w1', email: 'e@example.com', source: 'comp' });

    expect(update).toHaveBeenCalledOnce();
    expect(m.memberQrCode).toBe('qr_fixed_token');
  });
});
