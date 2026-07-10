import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { planPersist, executePersist, type BlockState } from '@/lib/connectors/ingest/persist';
import type { ResolutionDecision } from '@/lib/connectors/ingest/identity';
import type { NormalizedContact } from '@/lib/connectors/types';

// executePersist's Person-spine link (linkPersonSpine) dynamically imports resolvePerson
// at call time specifically so planPersist's own test file never has to know @/lib/db
// exists (see persist.ts's import comment). This file DOES exercise that path, so it
// mocks resolvePerson directly — isolating "does executePersist call it correctly" from
// resolvePerson's own identity-matching logic, which tests/unit/crm/resolve-person.test.ts
// already covers. No live database is touched (repo law: Adam runs all SQL, tests run offline).
const { resolvePersonMock } = vi.hoisted(() => ({ resolvePersonMock: vi.fn() }));
vi.mock('@/lib/crm/resolve-person', () => ({ resolvePerson: resolvePersonMock }));

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');
const noBlocks: BlockState = { accessBlockedIndices: new Set(), channelSuppressedIndices: new Set() };

function contact(p: Partial<NormalizedContact>): NormalizedContact {
  return { source: 'csv', externalId: p.externalId ?? 'x', rawSnapshot: p.rawSnapshot ?? null, sourceFetchedAt: fetchedAt, ...p };
}

type Call = { method: string; args: Record<string, unknown> };

/** A recording mock that satisfies the slice of PrismaClient executePersist uses. The
 *  `tx.*` methods back the $transaction(fn) callback (Member/ContactSource creates);
 *  the top-level `member.update` / `contactSource.*` methods back linkPersonSpine's
 *  post-transaction pass, which runs on the SAME db object in production (routes pass
 *  the one @/lib/db singleton through) but is a separate mock surface here. */
function mockDb(
  seed: Record<string, { roles: string[]; tags: string[] }> = {},
  contactSourceSeed: Record<string, { id: string; personId: string | null }> = {},
) {
  const calls: Call[] = [];
  const store = new Map<string, { roles: string[]; tags: string[] }>(Object.entries(seed));
  const contactSources = new Map<string, { id: string; personId: string | null }>(Object.entries(contactSourceSeed));
  let seq = 0;
  let csSeq = 0;
  const tx = {
    member: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `m_${seq++}`;
        calls.push({ method: 'member.create', args: data });
        store.set(id, { roles: (data.roles as string[]) ?? [], tags: (data.tags as string[]) ?? [] });
        return { id };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        calls.push({ method: 'member.findUnique', args: where });
        return store.get(where.id) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push({ method: 'member.update', args: { id: where.id, ...data } });
        return { id: where.id };
      },
    },
    contactSource: {
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ method: 'contactSource.upsert', args });
        const where = args.where as { workspaceId_memberId_source: { memberId: string } };
        const memberId = where.workspaceId_memberId_source.memberId;
        if (!contactSources.has(memberId)) contactSources.set(memberId, { id: `cs_${csSeq++}`, personId: null });
        return {};
      },
    },
  };
  const db = {
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    member: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push({ method: 'db.member.update', args: { id: where.id, ...data } });
        return { id: where.id };
      },
    },
    contactSource: {
      // The "import row" (memberId-keyed, from the transaction above) and the "person
      // row" (personId-keyed, from resolvePerson's own recordProvenance) are the SAME
      // row in this mock — recordProvenance is mocked away entirely (resolvePersonMock
      // doesn't touch contactSources), so only the memberId-keyed row ever exists.
      // linkPersonSpine's reconciliation branch (two distinct rows → merge + delete)
      // is therefore exercised by asserting on the calls it WOULD make, per test below.
      findUnique: async (args: Record<string, unknown>) => {
        calls.push({ method: 'db.contactSource.findUnique', args });
        const where = args.where as Record<string, unknown>;
        if ('workspaceId_memberId_source' in where) {
          const w = where.workspaceId_memberId_source as { memberId: string };
          const row = contactSources.get(w.memberId);
          return row ? { id: row.id, memberId: w.memberId, personId: row.personId } : null;
        }
        return null; // workspaceId_personId_source: no separate personId-keyed row in this mock
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push({ method: 'db.contactSource.update', args: { id: where.id, ...data } });
        for (const row of contactSources.values()) {
          if (row.id === where.id) row.personId = (data.personId as string) ?? row.personId;
        }
        return { id: where.id };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        calls.push({ method: 'db.contactSource.delete', args: where });
        return { id: where.id };
      },
    },
  };
  return { db: db as unknown as PrismaClient, calls };
}

const only = (calls: Call[], method: string) => calls.filter((c) => c.method === method);

beforeEach(() => {
  resolvePersonMock.mockReset();
  resolvePersonMock.mockResolvedValue({ id: 'p_default' });
});

describe('executePersist (mock transaction)', () => {
  it('CREATE → mints a Member (synthetic clerkUserId + QR + GUEST + roles) and a ContactSource', async () => {
    const contacts = [contact({ email: 'New@Person.com', firstName: 'New', lastName: 'Person', roleHint: 'vendor', tags: ['x', 'x'] })];
    const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
    const { db, calls } = mockDb();

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

    const creates = only(calls, 'member.create');
    expect(creates).toHaveLength(1);
    const data = creates[0].args;
    expect(String(data.clerkUserId)).toMatch(/^import:csv:/);
    expect(data.email).toBe('new@person.com');
    expect(data.status).toBe('GUEST');
    expect(data.roles).toEqual(['vendor']);
    expect(data.tags).toEqual(['x']);
    expect(data.memberQrCode).toBeTruthy();
    expect(data.workspaceId).toBe('ws1');

    const upserts = only(calls, 'contactSource.upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].args.where).toEqual({
      workspaceId_memberId_source: { workspaceId: 'ws1', memberId: 'm_0', source: 'csv' },
    });

    expect(res.createdMemberIds).toEqual(['m_0']);
    expect(res.memberIdByContactIndex).toEqual(['m_0']);
  });

  it('ATTACH (existing) → reads current roles/tags and writes the UNION, plus a ContactSource', async () => {
    const contacts = [contact({ email: 'amy@nobc.com', roleHint: 'subscriber', tags: ['vip'] })];
    const decisions: ResolutionDecision[] = [{ kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' }];
    const { db, calls } = mockDb({ c_amy: { roles: ['member'], tags: ['founder'] } });

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

    expect(only(calls, 'member.create')).toHaveLength(0);
    expect(only(calls, 'member.findUnique')).toHaveLength(1);
    const update = only(calls, 'member.update')[0];
    expect(update.args.roles).toEqual(['member', 'subscriber']); // union
    expect(update.args.tags).toEqual(['founder', 'vip']); // union
    expect(only(calls, 'contactSource.upsert')).toHaveLength(1);
    expect(res.attachedMemberIds).toEqual(['c_amy']);
  });

  it('PROVISIONAL attach → ContactSource lands on the member created earlier in the batch', async () => {
    const contacts = [
      contact({ externalId: 'r1', email: 'zoe@nobc.com', firstName: 'Zoe' }),
      contact({ externalId: 'r2', email: 'zoe@nobc.com', roleHint: 'lead' }),
    ];
    const decisions: ResolutionDecision[] = [
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 },
      { kind: 'match', contactId: 'provisional:0', matchedOn: 'email_exact' },
    ];
    const { db, calls } = mockDb();

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

    expect(res.createdMemberIds).toEqual(['m_0']);
    expect(res.attachedMemberIds).toEqual(['m_0']);
    expect(res.memberIdByContactIndex).toEqual(['m_0', 'm_0']);
    // The attach's ContactSource + role union both target the created member m_0.
    const upsertMemberIds = only(calls, 'contactSource.upsert').map(
      (c) => (c.args.where as { workspaceId_memberId_source: { memberId: string } }).workspaceId_memberId_source.memberId,
    );
    expect(upsertMemberIds).toEqual(['m_0', 'm_0']);
    expect(only(calls, 'member.update')[0].args.roles).toEqual(['lead']); // unioned onto Zoe's (empty) roles
  });

  it('ATTACH with no roles/tags to add → skips the findUnique/update read-modify-write', async () => {
    const contacts = [contact({ email: 'amy@nobc.com' })]; // no roleHint, no tags
    const decisions: ResolutionDecision[] = [{ kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' }];
    const { db, calls } = mockDb();

    await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

    expect(only(calls, 'member.findUnique')).toHaveLength(0);
    expect(only(calls, 'member.update')).toHaveLength(0);
    expect(only(calls, 'contactSource.upsert')).toHaveLength(1);
  });

  it('DEFER items write nothing', async () => {
    const contacts = [contact({ phone: '5125550002' }), contact({ phone: '5125550003' })];
    const decisions: ResolutionDecision[] = [
      { kind: 'review', reason: 'soft_match', candidates: [{ contactId: 'c_ben', key: 'phone' }] },
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }, // no email → defer
    ];
    const { db, calls } = mockDb();

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

    expect(calls).toHaveLength(0);
    expect(res.deferred).toBe(2);
    expect(res.memberIdByContactIndex).toEqual([null, null]);
  });

  describe('Person-spine link (Slice 2 Phase 1, DoD item 2)', () => {
    it('CREATE resolves the Person spine and links personId — wired at creation, not backfilled', async () => {
      const contacts = [
        contact({ externalId: 'ac_1', email: 'New@Person.com', firstName: 'New', lastName: 'Person', phone: '5125550001', roleHint: 'vendor' }),
      ];
      const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
      const { db, calls } = mockDb();
      resolvePersonMock.mockResolvedValue({ id: 'p_new' });

      await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

      expect(resolvePersonMock).toHaveBeenCalledTimes(1);
      expect(resolvePersonMock).toHaveBeenCalledWith({
        workspaceId: 'ws1',
        email: 'new@person.com',
        emailVerified: false, // imported email is typed/synced, never identity-provider-proven
        phone: '5125550001',
        firstName: 'New',
        lastName: 'Person',
        roles: ['vendor'],
        source: 'csv',
        sourceExternalId: 'ac_1',
      });
      const personLink = only(calls, 'db.member.update')[0];
      expect(personLink.args).toEqual({ id: 'm_0', personId: 'p_new' });
    });

    it('CREATE with an ACCESS block still carries redListed:true through to the Member row', async () => {
      const contacts = [contact({ email: 'blocked@nobc.com', firstName: 'Blocked' })];
      const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
      const { db, calls } = mockDb();

      await executePersist(db, 'ws1', planPersist(contacts, decisions, {
        accessBlockedIndices: new Set([0]),
        channelSuppressedIndices: new Set(),
      }));

      expect(only(calls, 'member.create')[0].args.redListed).toBe(true);
      // Person-spine linking still runs — an access-blocked import is still Person-visible.
      expect(resolvePersonMock).toHaveBeenCalledTimes(1);
    });

    it('ATTACH never triggers Person-spine linking — scoped to CREATE only in this slice (existing Members already carry personId via every current create path)', async () => {
      const contacts = [contact({ email: 'amy@nobc.com', roleHint: 'subscriber' })];
      const decisions: ResolutionDecision[] = [{ kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' }];
      const { db } = mockDb({ c_amy: { roles: ['member'], tags: [] } });

      await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

      expect(resolvePersonMock).not.toHaveBeenCalled();
    });

    it('a Person-spine link failure is non-fatal — the created Member survives', async () => {
      const contacts = [contact({ email: 'new@person.com', firstName: 'New' })];
      const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
      const { db, calls } = mockDb();
      resolvePersonMock.mockRejectedValueOnce(new Error('boom'));

      const res = await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

      expect(res.createdMemberIds).toEqual(['m_0']); // the Member create itself is unaffected
      expect(only(calls, 'db.member.update')).toHaveLength(0); // personId link never happened
    });

    it('reconciles two split ContactSource rows (memberId-keyed import row + personId-keyed provenance row) into one', async () => {
      const contacts = [contact({ externalId: 'ac_1', email: 'split@nobc.com', firstName: 'Split' })];
      const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
      resolvePersonMock.mockResolvedValue({ id: 'p_split' });

      const calls: Call[] = [];
      const tx = {
        member: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            calls.push({ method: 'member.create', args: data });
            return { id: 'm_0' };
          },
        },
        contactSource: {
          upsert: async (args: Record<string, unknown>) => {
            calls.push({ method: 'contactSource.upsert', args });
            return {};
          },
        },
      };
      const db = {
        $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
        member: {
          update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            calls.push({ method: 'db.member.update', args: { id: where.id, ...data } });
            return { id: where.id };
          },
        },
        contactSource: {
          // Simulate resolvePerson's own recordProvenance() having ALREADY created a
          // separate, thinner personId-keyed row (as it always does — see persist.ts's
          // linkPersonSpine comment) — distinct from the richer memberId-keyed row
          // upsertContactSource() wrote inside the transaction above.
          findUnique: async (args: Record<string, unknown>) => {
            calls.push({ method: 'db.contactSource.findUnique', args });
            const where = args.where as Record<string, unknown>;
            if ('workspaceId_memberId_source' in where) return { id: 'cs_import', memberId: 'm_0', personId: null };
            return { id: 'cs_person', memberId: null, personId: 'p_split' };
          },
          update: async (args: Record<string, unknown>) => {
            calls.push({ method: 'db.contactSource.update', args });
            return {};
          },
          delete: async (args: Record<string, unknown>) => {
            calls.push({ method: 'db.contactSource.delete', args });
            return {};
          },
        },
      } as unknown as PrismaClient;

      await executePersist(db, 'ws1', planPersist(contacts, decisions, noBlocks));

      const update = only(calls, 'db.contactSource.update')[0];
      expect(update.args).toEqual({ where: { id: 'cs_import' }, data: { personId: 'p_split' } });
      const del = only(calls, 'db.contactSource.delete')[0];
      expect(del.args).toEqual({ where: { id: 'cs_person' } }); // the orphaned thinner row is dropped
    });
  });
});
