import { describe, it, expect } from 'vitest';
import { planPersist } from '@/lib/connectors/ingest/persist';
import { buildContactIndex, resolveBatch } from '@/lib/connectors/ingest/identity';
import type { ResolutionDecision } from '@/lib/connectors/ingest/identity';
import type { NormalizedContact } from '@/lib/connectors/types';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

function contact(p: Partial<NormalizedContact>): NormalizedContact {
  return {
    source: 'csv',
    externalId: p.externalId ?? 'x',
    rawSnapshot: p.rawSnapshot ?? null,
    sourceFetchedAt: fetchedAt,
    ...p,
  };
}

describe('planPersist (pure)', () => {
  it('plans a CREATE for an email-bearing new contact, carrying roleHint + tags', () => {
    const contacts = [
      contact({ email: 'New@Person.com', firstName: 'New', lastName: 'Person', phone: '5125550001', roleHint: 'vendor', tags: ['a', 'a', 'b'] }),
    ];
    const decisions: ResolutionDecision[] = [
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 2 },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.summary).toMatchObject({ create: 1, attach: 0, defer: 0 });
    const item = plan.items[0];
    expect(item.action).toBe('create');
    if (item.action === 'create') {
      expect(item.member.email).toBe('new@person.com'); // normalized
      expect(item.member.roles).toEqual(['vendor']);
      expect(item.member.tags).toEqual(['a', 'b']); // deduped
      expect(item.source.source).toBe('csv');
    }
  });

  it('DEFERS a create with no email (Member.email is required) — reason no_email', () => {
    const contacts = [contact({ phone: '5125550009', firstName: 'No', lastName: 'Email' })];
    const decisions: ResolutionDecision[] = [
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.summary.deferByReason.no_email).toBe(1);
    expect(plan.items[0]).toEqual({ action: 'defer', contactIndex: 0, reason: 'no_email' });
  });

  it('plans an ATTACH onto an existing member for a match', () => {
    const contacts = [contact({ email: 'amy@nobc.com', roleHint: 'subscriber', tags: ['vip'] })];
    const decisions: ResolutionDecision[] = [
      { kind: 'match', contactId: 'c_amy', matchedOn: 'email_exact' },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.summary).toMatchObject({ create: 0, attach: 1, defer: 0 });
    const item = plan.items[0];
    expect(item.action).toBe('attach');
    if (item.action === 'attach') {
      expect(item.target).toEqual({ kind: 'existing', memberId: 'c_amy' });
      expect(item.addRoles).toEqual(['subscriber']);
      expect(item.addTags).toEqual(['vip']);
    }
  });

  it('DEFERS a review decision — reason needs_review (never auto-persisted)', () => {
    const contacts = [contact({ phone: '5125550002' })];
    const decisions: ResolutionDecision[] = [
      { kind: 'review', reason: 'soft_match', candidates: [{ contactId: 'c_ben', key: 'phone' }] },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.items[0]).toEqual({ action: 'defer', contactIndex: 0, reason: 'needs_review' });
  });

  it('attaches a provisional match when that provisional WILL be created', () => {
    const contacts = [
      contact({ externalId: 'r1', email: 'zoe@nobc.com', firstName: 'Zoe' }),
      contact({ externalId: 'r2', email: 'zoe@nobc.com', roleHint: 'lead' }),
    ];
    const decisions: ResolutionDecision[] = [
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 },
      { kind: 'match', contactId: 'provisional:0', matchedOn: 'email_exact' },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.summary).toMatchObject({ create: 1, attach: 1, defer: 0 });
    const attach = plan.items[1];
    if (attach.action === 'attach') {
      expect(attach.target).toEqual({ kind: 'provisional', provisionalId: 'provisional:0' });
    }
  });

  it('DEFERS a provisional match when that provisional was itself deferred (no email)', () => {
    // First row is a phone-only create → deferred (no_email); the second matched its
    // provisional, so it has nothing real to attach to.
    const contacts = [
      contact({ externalId: 'r1', phone: '5125557777' }),
      contact({ externalId: 'r2', phone: '5125557777' }),
    ];
    const decisions: ResolutionDecision[] = [
      { kind: 'create', provisionalId: 'provisional:0', identityKeyCount: 1 },
      { kind: 'match', contactId: 'provisional:0', matchedOn: 'email_exact' },
    ];
    const plan = planPersist(contacts, decisions);
    expect(plan.items[0]).toEqual({ action: 'defer', contactIndex: 0, reason: 'no_email' });
    expect(plan.items[1]).toEqual({ action: 'defer', contactIndex: 1, reason: 'unresolved_provisional' });
  });
});

describe('planPersist + resolveBatch (integration of the two pure layers)', () => {
  it('turns a realistic batch into a coherent plan', () => {
    const index = buildContactIndex([
      { contactId: 'c_amy', email: 'amy@nobc.com', phone: '5125550001' },
    ]);
    const contacts = [
      contact({ externalId: '1', email: 'amy@nobc.com', roleHint: 'subscriber' }), // match c_amy
      contact({ externalId: '2', email: 'new@nobc.com', firstName: 'New' }),       // create
      contact({ externalId: '3', phone: '5125550002' }),                            // create→no email→defer
      contact({ externalId: '4', email: 'new@nobc.com' }),                          // dup of #2 → attach provisional
    ];
    const decisions = resolveBatch(contacts, index);
    const plan = planPersist(contacts, decisions);
    expect(plan.summary.create).toBe(1); // only new@nobc.com once
    expect(plan.summary.attach).toBe(2); // amy match + the in-batch dup
    expect(plan.summary.defer).toBe(1); // phone-only no_email
    expect(plan.summary.deferByReason.no_email).toBe(1);
  });
});
