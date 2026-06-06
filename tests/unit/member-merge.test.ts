import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  memberFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  memberUpdate: vi.fn(),
  memberUpdateMany: vi.fn(),
  rsvpFindMany: vi.fn(),
  rsvpUpdate: vi.fn(),
  ticketUpdateMany: vi.fn(),
  waitlistUpdateMany: vi.fn(),
  engagementUpdateMany: vi.fn(),
  surveyUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    member: { findFirst: m.memberFindFirst, findUnique: m.memberFindUnique, findMany: m.memberFindMany, update: m.memberUpdate, updateMany: m.memberUpdateMany },
    rSVP: { findMany: m.rsvpFindMany, update: m.rsvpUpdate },
    ticket: { updateMany: m.ticketUpdateMany },
    waitlistEntry: { updateMany: m.waitlistUpdateMany },
    memberEngagementEvent: { updateMany: m.engagementUpdateMany },
    surveyResponse: { updateMany: m.surveyUpdateMany },
    auditEvent: { create: m.auditCreate },
  },
}));
vi.mock('@/lib/engagement', () => ({ logEngagementEvent: vi.fn() }));

import { executeMerge } from '@/lib/member-merge';

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  // both members exist, loser not yet merged
  m.memberFindFirst.mockImplementation(({ where }: any) =>
    Promise.resolve({ id: where.id, mergedIntoId: null }),
  );
  m.memberUpdate.mockResolvedValue({});
  m.memberUpdateMany.mockResolvedValue({ count: 0 });
  m.rsvpUpdate.mockResolvedValue({});
  m.ticketUpdateMany.mockResolvedValue({ count: 0 });
  m.waitlistUpdateMany.mockResolvedValue({ count: 0 });
  m.engagementUpdateMany.mockResolvedValue({ count: 0 });
  m.surveyUpdateMany.mockResolvedValue({ count: 0 });
  m.auditCreate.mockResolvedValue({});
});

describe('executeMerge', () => {
  it('re-points loser history to canonical and tombstones the loser', async () => {
    // canonical has no RSVPs; loser has one RSVP on event E1 (no collision)
    m.rsvpFindMany
      .mockResolvedValueOnce([]) // canonical event ids
      .mockResolvedValueOnce([{ id: 'r1', eventId: 'E1' }]); // loser rsvps
    m.ticketUpdateMany.mockResolvedValue({ count: 2 });

    const res = await executeMerge({ workspaceId: 'w1', canonicalId: 'C', loserId: 'L', actorId: 'op1' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repointed.rsvpsRepointed).toBe(1);
      expect(res.repointed.rsvpsArchived).toBe(0);
      expect(res.repointed.tickets).toBe(2);
    }
    // loser tombstoned with mergedIntoId
    const tomb = m.memberUpdate.mock.calls.find((c) => c[0].where.id === 'L');
    expect(tomb?.[0].data).toMatchObject({ mergedIntoId: 'C' });
  });

  it('collision: archives the loser RSVP (DECLINED + merged_duplicate), never blind re-points', async () => {
    // canonical already attends E1; loser also has an RSVP on E1
    m.rsvpFindMany
      .mockResolvedValueOnce([{ eventId: 'E1' }]) // canonical event ids
      .mockResolvedValueOnce([{ id: 'r1', eventId: 'E1' }]); // loser rsvps

    const res = await executeMerge({ workspaceId: 'w1', canonicalId: 'C', loserId: 'L', actorId: 'op1' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.repointed.rsvpsArchived).toBe(1);
      expect(res.repointed.rsvpsRepointed).toBe(0);
    }
    const upd = m.rsvpUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'r1' });
    expect(upd.data).toMatchObject({ status: 'DECLINED', ticketStatus: 'merged_duplicate' });
    // INVARIANT: the archive update must NOT carry memberId.
    expect(upd.data).not.toHaveProperty('memberId');
  });

  it('INVARIANT: re-pointing never touches an RSVP event association (no eventId in any update)', async () => {
    m.rsvpFindMany
      .mockResolvedValueOnce([]) // canonical
      .mockResolvedValueOnce([{ id: 'r1', eventId: 'E1' }, { id: 'r2', eventId: 'E2' }]); // loser

    await executeMerge({ workspaceId: 'w1', canonicalId: 'C', loserId: 'L', actorId: 'op1' });

    for (const call of m.rsvpUpdate.mock.calls) {
      expect(call[0].data).not.toHaveProperty('eventId');
    }
    // a genuine re-point sets memberId to canonical and nothing else of note
    const repoint = m.rsvpUpdate.mock.calls.find((c) => c[0].data.memberId);
    expect(repoint?.[0].data).toEqual({ memberId: 'C' });
  });

  it('refuses to merge a member into itself', async () => {
    const res = await executeMerge({ workspaceId: 'w1', canonicalId: 'X', loserId: 'X', actorId: 'op1' });
    expect(res.ok).toBe(false);
  });
});

// Active-member reads must exclude soft-merged duplicates so a merge drops the
// active count by one. Source-level guard over the aggregate/list reads.
describe('active-member reads filter mergedIntoId:null', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

  it.each([
    'app/api/operator/counts/route.ts',
    'app/api/operator/members/route.ts',
    'app/api/operator/events/[id]/route.ts',
    'app/operator/intelligence/sponsor/page.tsx',
    'app/operator/intelligence/sponsor/actions.ts',
  ])('%s filters mergedIntoId: null', (file) => {
    expect(read(file)).toMatch(/mergedIntoId:\s*null/);
  });
});
