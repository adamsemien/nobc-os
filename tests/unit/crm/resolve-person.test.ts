import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// resolvePerson (Phase 2A) — unit suite over a mocked Prisma client. No live
// database is touched (repo law: Adam runs all SQL; tests must run offline).

const { personFindUnique, personFindFirst, personCreate, personUpdate, contactSourceUpsert } =
  vi.hoisted(() => ({
    personFindUnique: vi.fn(),
    personFindFirst: vi.fn(),
    personCreate: vi.fn(),
    personUpdate: vi.fn(),
    contactSourceUpsert: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: {
    person: {
      findUnique: personFindUnique,
      findFirst: personFindFirst,
      create: personCreate,
      update: personUpdate,
    },
    contactSource: { upsert: contactSourceUpsert },
  },
}));

import {
  resolvePerson,
  realClerkUserId,
  contactSourceFromResolveSource,
} from '@/lib/crm/resolve-person';

function person(over: Record<string, unknown> = {}) {
  return {
    id: 'p_existing',
    workspaceId: 'w1',
    clerkUserId: null,
    email: null,
    emailVerified: false,
    phone: null,
    firstName: null,
    lastName: null,
    roles: [],
    potentialDuplicateOfId: null,
    mergedIntoId: null,
    mergedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

beforeEach(() => {
  personFindUnique.mockReset();
  personFindFirst.mockReset();
  personCreate.mockReset();
  personUpdate.mockReset();
  contactSourceUpsert.mockReset();
  contactSourceUpsert.mockResolvedValue({});
  personUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(person({ id: 'p_existing', ...data })),
  );
});

describe('resolvePerson — clerkUserId is the authoritative key', () => {
  it('links by (workspaceId, clerkUserId) without minting', async () => {
    const existing = person({ clerkUserId: 'user_real1', email: 'a@x.com', emailVerified: true });
    personFindUnique.mockResolvedValueOnce(existing);

    const result = await resolvePerson({
      workspaceId: 'w1',
      clerkUserId: 'user_real1',
      email: 'a@x.com',
      emailVerified: true,
      source: 'clerk',
    });

    expect(personCreate).not.toHaveBeenCalled();
    expect(result.id).toBe('p_existing');
    // The lookup is workspace-scoped through the compound unique.
    expect(personFindUnique.mock.calls[0][0].where).toEqual({
      workspaceId_clerkUserId: { workspaceId: 'w1', clerkUserId: 'user_real1' },
    });
  });

  it('follows a soft-merge pointer to the canonical person', async () => {
    personFindUnique
      .mockResolvedValueOnce(person({ id: 'p_dupe', clerkUserId: 'user_m', mergedIntoId: 'p_canon' }))
      .mockResolvedValueOnce(person({ id: 'p_canon', email: 'canon@x.com' }));

    const result = await resolvePerson({
      workspaceId: 'w1',
      clerkUserId: 'user_m',
      source: 'clerk',
    });

    expect(result.id).toBe('p_canon');
    expect(personCreate).not.toHaveBeenCalled();
  });

  it('treats placeholder clerk ids as absent — never an identity key', async () => {
    personFindFirst.mockResolvedValue(null);
    personCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(person({ id: 'p_new', ...data })),
    );

    await resolvePerson({
      workspaceId: 'w1',
      clerkUserId: 'guest:someone@x.com',
      email: 'someone@x.com',
      emailVerified: false,
      source: 'event',
    });

    // No clerk lookup and no clerk id stored — the placeholder was stripped.
    expect(personFindUnique).not.toHaveBeenCalled();
    expect(personCreate.mock.calls[0][0].data.clerkUserId).toBeNull();
  });
});

describe('resolvePerson — verified email links, unverified NEVER does', () => {
  it('links a VERIFIED email to the existing person and stamps the proof', async () => {
    const existing = person({ email: 'trent@x.com', emailVerified: false });
    personFindFirst.mockResolvedValueOnce(existing);

    const result = await resolvePerson({
      workspaceId: 'w1',
      clerkUserId: 'user_new9',
      email: 'Trent@X.com',
      emailVerified: true,
      source: 'clerk',
    });

    expect(personCreate).not.toHaveBeenCalled();
    // Match is case-insensitive, workspace-scoped, canonical-only.
    expect(personFindFirst.mock.calls[0][0].where).toMatchObject({
      workspaceId: 'w1',
      email: { equals: 'trent@x.com', mode: 'insensitive' },
      mergedIntoId: null,
    });
    // The proven state is stamped through: clerk id + emailVerified.
    expect(personUpdate).toHaveBeenCalledOnce();
    expect(personUpdate.mock.calls[0][0].data).toMatchObject({
      clerkUserId: 'user_new9',
      emailVerified: true,
    });
    expect(result.emailVerified).toBe(true);
  });

  it('NEVER links an unverified email — mints a new person flagged as a potential duplicate', async () => {
    const existing = person({ id: 'p_victim', email: 'victim@x.com', emailVerified: true });
    personFindFirst.mockResolvedValueOnce(existing);
    personCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(person({ id: 'p_new', ...data })),
    );

    const result = await resolvePerson({
      workspaceId: 'w1',
      email: 'victim@x.com',
      emailVerified: false,
      firstName: 'Not',
      lastName: 'Victim',
      source: 'application',
    });

    // The existing person is untouched; a NEW person is minted and flagged.
    expect(personUpdate).not.toHaveBeenCalled();
    expect(result.id).toBe('p_new');
    expect(personCreate.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'w1',
      email: 'victim@x.com',
      emailVerified: false,
      potentialDuplicateOfId: 'p_victim',
    });
  });

  it('mints clean when nothing matches (normalized email, unverified)', async () => {
    personFindFirst.mockResolvedValue(null);
    personCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(person({ id: 'p_new', ...data })),
    );

    const result = await resolvePerson({
      workspaceId: 'w1',
      email: '  Fresh@X.com ',
      emailVerified: false,
      source: 'application',
    });

    expect(result.id).toBe('p_new');
    expect(personCreate.mock.calls[0][0].data).toMatchObject({
      email: 'fresh@x.com',
      emailVerified: false,
      potentialDuplicateOfId: null,
    });
    // Provenance rides along on the new (workspace, person, source) unique.
    expect(contactSourceUpsert).toHaveBeenCalledOnce();
  });
});

describe('resolvePerson — workspace isolation', () => {
  it('a same-email person in another workspace never matches', async () => {
    // The DB would not return the w1 person for a w2-scoped query; assert the
    // query itself carries the workspace boundary.
    personFindFirst.mockResolvedValue(null);
    personCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(person({ id: 'p_w2', workspaceId: 'w2', ...data })),
    );

    const result = await resolvePerson({
      workspaceId: 'w2',
      email: 'shared@x.com',
      emailVerified: true,
      source: 'clerk',
    });

    expect(personFindFirst.mock.calls[0][0].where.workspaceId).toBe('w2');
    expect(result.workspaceId).toBe('w2');
    expect(personCreate.mock.calls[0][0].data.workspaceId).toBe('w2');
  });
});

describe('resolvePerson — concurrent-mint race safety', () => {
  it('recovers from P2002 on (workspaceId, clerkUserId) by re-resolving the winner', async () => {
    personFindUnique.mockResolvedValueOnce(null); // initial clerk lookup: miss
    personFindFirst.mockResolvedValue(null);
    personCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const winner = person({ id: 'p_winner', clerkUserId: 'user_race' });
    personFindUnique.mockResolvedValueOnce(winner); // post-P2002 requery: winner

    const result = await resolvePerson({
      workspaceId: 'w1',
      clerkUserId: 'user_race',
      source: 'clerk',
    });

    expect(result.id).toBe('p_winner');
  });
});

describe('helpers', () => {
  it('realClerkUserId strips every placeholder family, keeps real ids', () => {
    for (const placeholder of [
      'app_123',
      'applicant:abc',
      'guest:a@x.com',
      'manual:uuid',
      'mcp:app1',
      'comp:a@x.com',
      'user_DEMOSEED1',
    ]) {
      expect(realClerkUserId(placeholder)).toBeNull();
    }
    expect(realClerkUserId('user_2abcDEF')).toBe('user_2abcDEF');
    expect(realClerkUserId(null)).toBeNull();
  });

  it('contactSourceFromResolveSource maps every live resolveMember source label', () => {
    expect(contactSourceFromResolveSource('apply_membership')).toBe('application');
    expect(contactSourceFromResolveSource('apply_slug')).toBe('application');
    expect(contactSourceFromResolveSource('apply_purple')).toBe('application');
    expect(contactSourceFromResolveSource('apply')).toBe('application');
    expect(contactSourceFromResolveSource('approval')).toBe('application');
    expect(contactSourceFromResolveSource('apply_event_rsvp')).toBe('event');
    expect(contactSourceFromResolveSource('clerk_open_rsvp')).toBe('event');
    expect(contactSourceFromResolveSource('plus_one')).toBe('event');
  });
});
