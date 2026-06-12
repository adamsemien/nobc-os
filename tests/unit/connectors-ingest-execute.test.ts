import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { planPersist, executePersist } from '@/lib/connectors/ingest/persist';
import type { ResolutionDecision } from '@/lib/connectors/ingest/identity';
import type { NormalizedContact } from '@/lib/connectors/types';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

function contact(p: Partial<NormalizedContact>): NormalizedContact {
  return { source: 'csv', externalId: p.externalId ?? 'x', rawSnapshot: p.rawSnapshot ?? null, sourceFetchedAt: fetchedAt, ...p };
}

type Call = { method: string; args: Record<string, unknown> };

/** A recording mock that satisfies the slice of PrismaClient executePersist uses:
 *  $transaction(fn) runs fn(tx); tx records every create/findUnique/update/upsert. */
function mockDb(seed: Record<string, { roles: string[]; tags: string[] }> = {}) {
  const calls: Call[] = [];
  const store = new Map<string, { roles: string[]; tags: string[] }>(Object.entries(seed));
  let seq = 0;
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
        return {};
      },
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) };
  return { db: db as unknown as PrismaClient, calls };
}

const only = (calls: Call[], method: string) => calls.filter((c) => c.method === method);

describe('executePersist (mock transaction)', () => {
  it('CREATE → mints a Member (synthetic clerkUserId + QR + GUEST + roles) and a ContactSource', async () => {
    const contacts = [contact({ email: 'New@Person.com', firstName: 'New', lastName: 'Person', roleHint: 'vendor', tags: ['x', 'x'] })];
    const decisions: ResolutionDecision[] = [{ kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 }];
    const { db, calls } = mockDb();

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions));

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

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions));

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

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions));

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

    await executePersist(db, 'ws1', planPersist(contacts, decisions));

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

    const res = await executePersist(db, 'ws1', planPersist(contacts, decisions));

    expect(calls).toHaveLength(0);
    expect(res.deferred).toBe(2);
    expect(res.memberIdByContactIndex).toEqual([null, null]);
  });
});
