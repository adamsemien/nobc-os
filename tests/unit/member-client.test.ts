import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  memberKeys,
  MemberApiError,
  fetchMemberRecord,
  patchMemberFields,
  optimisticApplyFieldWrites,
} from '@/lib/member-client';
import type { MemberRecord } from '@/lib/member-record';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('memberKeys', () => {
  it('produces stable record keys, with and without a limit', () => {
    expect(memberKeys.record('M')).toEqual(['member', 'M', 'record']);
    expect(memberKeys.record('M', 10)).toEqual(['member', 'M', 'record', { limit: 10 }]);
  });
});

describe('fetchMemberRecord', () => {
  it('GETs the record endpoint and returns parsed JSON', async () => {
    const body = { member: { id: 'M' }, timeline: [] };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const rec = await fetchMemberRecord('M', { limit: 5 });
    expect(rec).toEqual(body);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/operator/members/M/record?limit=5');
  });

  it('throws a MemberApiError carrying status + server error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    );
    await expect(fetchMemberRecord('M')).rejects.toMatchObject({
      name: 'MemberApiError',
      status: 403,
      message: 'Forbidden',
    });
  });
});

describe('patchMemberFields', () => {
  it('PATCHes the member endpoint with a fields body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ member: { id: 'M' } }), { status: 200 }));
    await patchMemberFields('M', { industry: { value: 'Fashion' } });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/operator/members/M');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      fields: { industry: { value: 'Fashion' } },
    });
  });
});

describe('optimisticApplyFieldWrites', () => {
  const record = {
    member: { id: 'M' },
    customFields: { city: 'NYC' },
    fieldProvenance: { city: { value: 'NYC', source: 'self_reported', syncedAt: 't0' } },
    psychographics: null,
    timeline: [],
  } as unknown as MemberRecord;

  it('stamps the write and preserves other keys, without mutating the input', () => {
    const next = optimisticApplyFieldWrites(record, { industry: { value: 'Fashion' } }, 't1');
    expect(next.customFields).toEqual({ city: 'NYC', industry: 'Fashion' });
    expect(next.fieldProvenance!.industry).toEqual({ value: 'Fashion', source: 'operator_entered', syncedAt: 't1' });
    // input untouched
    expect(record.customFields).toEqual({ city: 'NYC' });
    expect((record.fieldProvenance as any).industry).toBeUndefined();
  });

  it('honors an explicit source + confidence', () => {
    const next = optimisticApplyFieldWrites(
      record,
      { score: { value: 5, source: 'ai_inferred', confidence: 0.5 } },
      't1',
    );
    expect(next.fieldProvenance!.score).toMatchObject({ source: 'ai_inferred', confidence: 0.5 });
  });
});

describe('MemberApiError', () => {
  it('is an Error subclass with a status', () => {
    const e = new MemberApiError(404, 'Not found');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
  });
});
