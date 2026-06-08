import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  psychoFindUnique: vi.fn(),
  engagementFindMany: vi.fn(),
  watchFindFirst: vi.fn(),
  applicationFindFirst: vi.fn(),
  fieldDefFindMany: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    member: { findFirst: m.memberFindFirst },
    memberPsychographics: { findUnique: m.psychoFindUnique },
    memberEngagementEvent: { findMany: m.engagementFindMany },
    watchList: { findFirst: m.watchFindFirst },
    application: { findFirst: m.applicationFindFirst },
    fieldDefinition: { findMany: m.fieldDefFindMany },
  },
}));

import { assembleMemberRecord } from '@/lib/member-record';
import { toSponsorAudienceMember } from '@/lib/intelligence/sponsor-safe';

const baseMember = {
  id: 'M', firstName: 'Ada', lastName: 'L', email: 'a@x.com', phone: null,
  status: 'APPROVED', tags: ['vip'], redListed: false, approved: true,
  approvedAt: new Date('2026-01-01T00:00:00Z'), totalEventsAttended: 3,
  lastAttendedDate: null, enrichmentStatus: 'NONE', enrichmentLastSynced: null,
  mergedIntoId: null, mergedAt: null, createdAt: new Date('2025-12-01T00:00:00Z'),
  aiSummary: 'A strong fit.', energyScore: 82, networkValueScore: 71,
  customFields: { vibe: 'high' }, fieldProvenance: { vibe: { value: 'high', source: 'operator_entered', syncedAt: 't' } },
  industry: 'Fashion', jobFunction: 'Founder', seniority: 'C-Suite', companySize: '11-50',
  companyName: 'Acme', companyDomain: 'acme.com', linkedinUrl: 'li/ada', instagram: 'ada',
  city: 'NYC', country: 'US', ageRange: '30-39',
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.memberFindFirst.mockResolvedValue(baseMember);
  m.psychoFindUnique.mockResolvedValue({
    archetype: 'Connector', archetypeScores: { Connector: 80 }, interests: ['art'], tasteSignals: { x: 1 },
  });
  m.engagementFindMany.mockResolvedValue([
    { id: 'e1', eventType: 'checked_in', eventId: 'EV1', occurredAt: new Date('2026-02-01T00:00:00Z'), metadata: null },
  ]);
  m.watchFindFirst.mockResolvedValue(null);
  m.applicationFindFirst.mockResolvedValue(null);
  m.fieldDefFindMany.mockResolvedValue([]);
});

describe('assembleMemberRecord', () => {
  it('groups firmographic + demographic dimensions and serializes dates', async () => {
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });
    expect(rec!.dimensions.firmographic).toMatchObject({ industry: 'Fashion', companyName: 'Acme', instagram: 'ada' });
    expect(rec!.dimensions.demographic).toEqual({ city: 'NYC', country: 'US', ageRange: '30-39' });
    expect(rec!.member.createdAt).toBe('2025-12-01T00:00:00.000Z');
    expect(rec!.customFields).toEqual({ vibe: 'high' });
    expect(rec!.timeline[0]).toMatchObject({ id: 'e1', eventType: 'checked_in', occurredAt: '2026-02-01T00:00:00.000Z' });
  });

  it('INCLUDES psychographics for an operator (includePsychographics: true)', async () => {
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });
    expect(rec!.psychographics).toEqual({
      archetype: 'Connector', archetypeScores: { Connector: 80 }, interests: ['art'], tasteSignals: { x: 1 },
    });
    expect(m.psychoFindUnique).toHaveBeenCalledOnce();
  });

  it('OMITS psychographics and never queries it for a sponsor path (includePsychographics: false)', async () => {
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: false });
    expect(rec!.psychographics).toBeNull();
    // the firewall: the psychographics query is never even issued.
    expect(m.psychoFindUnique).not.toHaveBeenCalled();
  });

  it('surfaces core intelligence (aiSummary/scores), Red List, and application AI — without archetype', async () => {
    m.watchFindFirst.mockResolvedValue({ type: 'PURPLE', note: 'keep an eye' });
    m.applicationFindFirst.mockResolvedValue({ aiScore: 7.5, aiReasoning: 'great energy', aiRecommendation: 'yes' });

    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });

    expect(rec!.member).toMatchObject({ aiSummary: 'A strong fit.', energyScore: 82, networkValueScore: 71 });
    expect(rec!.redList).toEqual({ type: 'PURPLE', note: 'keep an eye' });
    expect(rec!.intelligence).toEqual({ aiScore: 7.5, aiReasoning: 'great energy', aiRecommendation: 'yes' });
    // the intelligence block must never carry psychographic archetype data
    expect(Object.keys(rec!.intelligence!)).not.toContain('archetype');
    expect(Object.keys(rec!.intelligence!)).not.toContain('archetypeScores');
    // the application read must not even request archetype fields
    expect(m.applicationFindFirst.mock.calls[0][0].select).toEqual({
      aiScore: true, aiReasoning: true, aiRecommendation: true,
    });
  });

  it('returns null redList + intelligence when there is no WatchList match or application', async () => {
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });
    expect(rec!.redList).toBeNull();
    expect(rec!.intelligence).toBeNull();
  });

  it('returns null when the member is not in the workspace', async () => {
    m.memberFindFirst.mockResolvedValue(null);
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'nope', includePsychographics: true });
    expect(rec).toBeNull();
  });

  it('surfaces active member field definitions (F5), ordered, scoped to section=member', async () => {
    m.fieldDefFindMany.mockResolvedValue([
      { stableKey: 'dietary', name: 'Dietary', type: 'text', options: [], sponsorVisible: false, order: 0 },
    ]);
    const rec = await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true });
    expect(rec!.fieldDefs).toEqual([
      { stableKey: 'dietary', name: 'Dietary', type: 'text', options: [], sponsorVisible: false, order: 0 },
    ]);
    expect(m.fieldDefFindMany.mock.calls[0][0]).toMatchObject({
      where: { workspaceId: 'w1', section: 'member', isActive: true },
      orderBy: { order: 'asc' },
    });
  });

  it('honors the timeline limit', async () => {
    await assembleMemberRecord({ workspaceId: 'w1', memberId: 'M', includePsychographics: true, timelineLimit: 5 });
    expect(m.engagementFindMany.mock.calls[0][0]).toMatchObject({ take: 5, orderBy: { occurredAt: 'desc' } });
  });
});

describe('toSponsorAudienceMember — runtime firewall projection', () => {
  it('drops every psychographic field even when present on the input', () => {
    const dirty = {
      ...baseMember,
      // psychographic contaminants a careless caller might pass through:
      archetype: 'Connector',
      archetypeScores: { Connector: 80 },
      interests: ['art'],
      tasteSignals: { x: 1 },
      psychographics: { archetype: 'Connector' },
      aiSummary: 'should not leak',
      householdIncome: '250k+',
    } as unknown as Parameters<typeof toSponsorAudienceMember>[0];

    const safe = toSponsorAudienceMember(dirty);
    const keys = Object.keys(safe);

    for (const forbidden of ['archetype', 'archetypeScores', 'interests', 'tasteSignals', 'psychographics', 'aiSummary', 'householdIncome']) {
      expect(keys).not.toContain(forbidden);
    }
    // and it keeps the firmographic/demographic projection intact
    expect(safe).toMatchObject({ id: 'M', industry: 'Fashion', city: 'NYC', companyName: 'Acme' });
  });
});
