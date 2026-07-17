import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma singleton and the QR mint so resolveMember can be exercised
// without a database. We assert on the exact `data` passed to member.create.
// The person/contactSource models back the person-spine paths (attachPersonSpine
// + resolvePerson fallback) — unset mocks return undefined, which the spine's
// non-fatal catch turns into "no personId", preserving the pre-spine assertions.
const {
  findFirst, findUnique, create, update,
  personFindFirst, personFindUnique, personCreate, contactSourceUpsert,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  personFindFirst: vi.fn(),
  personFindUnique: vi.fn(),
  personCreate: vi.fn(),
  contactSourceUpsert: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    member: { findFirst, findUnique, create, update },
    person: { findFirst: personFindFirst, findUnique: personFindUnique, create: personCreate },
    contactSource: { upsert: contactSourceUpsert },
  },
}));
vi.mock('@/lib/member-qr', () => ({ generateMemberQrCode: () => 'qr_fixed_token' }));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: vi.fn() }));

import { resolveMember } from '@/lib/member-identity';

beforeEach(() => {
  findFirst.mockReset();
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  personFindFirst.mockReset();
  personFindUnique.mockReset();
  personCreate.mockReset();
  contactSourceUpsert.mockReset();
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

  it('follows mergedIntoId to the canonical record on lookup', async () => {
    // The email resolves to a loser row pointing at canonical 'C'.
    findFirst.mockResolvedValue({
      id: 'loser', workspaceId: 'w1', email: 'f@example.com', firstName: 'F', lastName: '',
      status: 'GUEST', approved: false, memberQrCode: 'loser_qr', phone: null, mergedIntoId: 'C',
    });
    findUnique.mockResolvedValue({
      id: 'C', workspaceId: 'w1', email: 'canon@example.com', firstName: 'Canon', lastName: '',
      status: 'APPROVED', approved: true, memberQrCode: 'canon_qr', phone: null, mergedIntoId: null,
    });

    const m = await resolveMember({ workspaceId: 'w1', email: 'f@example.com', source: 'plus_one' });

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'C' } }));
    expect(m.id).toBe('C');
    expect(create).not.toHaveBeenCalled();
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

describe('resolveMember — caller-known personId (person spine)', () => {
  it('links the new member directly to input.personId, skipping resolvePerson', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));
    personFindUnique.mockResolvedValue({ id: 'p1', workspaceId: 'w1', mergedIntoId: null });
    update.mockResolvedValue({});

    const m = await resolveMember({
      workspaceId: 'w1', email: 'x@example.com', name: 'X', clerkUserId: 'app_123',
      personId: 'p1', source: 'apply',
    });

    expect(update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { personId: 'p1' } });
    expect(m.personId).toBe('p1');
    // Direct link — resolvePerson (email match / mint) never runs.
    expect(personFindFirst).not.toHaveBeenCalled();
    expect(personCreate).not.toHaveBeenCalled();
  });

  it('follows Person.mergedIntoId to the canonical person before linking', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));
    personFindUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'p1'
          ? { id: 'p1', workspaceId: 'w1', mergedIntoId: 'p2' }
          : { id: 'p2', workspaceId: 'w1', mergedIntoId: null },
      ),
    );
    update.mockResolvedValue({});

    const m = await resolveMember({
      workspaceId: 'w1', email: 'x@example.com', personId: 'p1', source: 'approval',
    });

    expect(update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { personId: 'p2' } });
    expect(m.personId).toBe('p2');
  });

  it('keeps an existing Member.personId when input.personId disagrees (never overwrites)', async () => {
    findFirst.mockResolvedValue({
      id: 'existing', workspaceId: 'w1', email: 'x@example.com', firstName: 'X', lastName: '',
      status: 'GUEST', approved: false, memberQrCode: 'q', phone: null,
      mergedIntoId: null, personId: 'pA',
    });

    const m = await resolveMember({
      workspaceId: 'w1', email: 'x@example.com', personId: 'pB', source: 'apply',
    });

    expect(m.personId).toBe('pA');
    expect(update).not.toHaveBeenCalled();
    expect(personFindUnique).not.toHaveBeenCalled();
  });

  it('falls back to resolvePerson when input.personId is dangling', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));
    personFindUnique.mockResolvedValue(null); // caller personId points at nothing
    personFindFirst.mockResolvedValue(null); // no email collision either
    personCreate.mockResolvedValue({ id: 'pNew', workspaceId: 'w1', email: 'x@example.com', roles: [] });
    contactSourceUpsert.mockResolvedValue({});
    update.mockResolvedValue({});

    const m = await resolveMember({
      workspaceId: 'w1', email: 'x@example.com', personId: 'p_gone', source: 'apply',
    });

    expect(personCreate).toHaveBeenCalledOnce(); // resolvePerson fallback minted
    expect(update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { personId: 'pNew' } });
    expect(m.personId).toBe('pNew');
  });

  it('never links a personId from another workspace — falls back to resolvePerson', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve({ id: 'm1', ...data }));
    personFindUnique.mockResolvedValue({ id: 'pX', workspaceId: 'OTHER_WS', mergedIntoId: null });
    personFindFirst.mockResolvedValue(null);
    personCreate.mockResolvedValue({ id: 'pNew', workspaceId: 'w1', email: 'x@example.com', roles: [] });
    contactSourceUpsert.mockResolvedValue({});
    update.mockResolvedValue({});

    const m = await resolveMember({
      workspaceId: 'w1', email: 'x@example.com', personId: 'pX', source: 'apply',
    });

    // The cross-tenant Person is never linked; the fallback mints in-workspace.
    expect(update).not.toHaveBeenCalledWith({ where: { id: 'm1' }, data: { personId: 'pX' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { personId: 'pNew' } });
    expect(m.personId).toBe('pNew');
  });
});
