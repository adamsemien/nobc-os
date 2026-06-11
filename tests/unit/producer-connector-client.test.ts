import { describe, it, expect } from 'vitest';
import { ProducerClient, ProducerClientError } from '@/lib/connectors/producer/client';
import type { ProducerVendor, ProducerVendorsPage } from '@/lib/connectors/producer/types';

function vendor(id: string): ProducerVendor {
  return {
    id,
    workspaceId: 'producer_ws',
    name: `Co ${id}`,
    roles: ['Vendor'],
    type: null,
    category: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    website: null,
    logoUrl: null,
    insuranceVerified: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

type Recorded = { url: string; headers: Record<string, string> };

/** A fake fetch that returns the given pages in order, recording each request. */
function mockFetch(pages: ProducerVendorsPage[]) {
  const calls: Recorded[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const page = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return {
      ok: true,
      status: 200,
      json: async () => page,
      text: async () => JSON.stringify(page),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const config = {
  endpointUrl: 'https://producer.example.com/api/crm-export/vendors',
  secret: 'shared-secret',
  now: () => 1_700_000_000_000,
};

describe('ProducerClient', () => {
  it('paginates with fetchAllVendors and threads the cursor', async () => {
    const { impl, calls } = mockFetch([
      { data: [vendor('a'), vendor('b')], nextCursor: 'cur1' },
      { data: [vendor('c')], nextCursor: null },
    ]);
    const client = new ProducerClient({ ...config, fetchImpl: impl });

    const all = await client.fetchAllVendors({ limit: 2 });

    expect(all.map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
    // first page: no cursor; second page: cursor threaded into the query
    expect(calls[0].url).toBe('https://producer.example.com/api/crm-export/vendors?limit=2');
    expect(calls[1].url).toBe(
      'https://producer.example.com/api/crm-export/vendors?cursor=cur1&limit=2',
    );
  });

  it('signs every request with the timestamp + hmac headers', async () => {
    const { impl, calls } = mockFetch([{ data: [vendor('a')], nextCursor: null }]);
    const client = new ProducerClient({ ...config, fetchImpl: impl });

    await client.fetchVendorsPage();

    expect(calls[0].headers['X-NoBC-Timestamp']).toBe('1700000000');
    expect(calls[0].headers['X-NoBC-Signature']).toMatch(/^hmac-sha256=[0-9a-f]{64}$/);
  });

  it('stops on a non-advancing cursor instead of looping forever', async () => {
    const { impl, calls } = mockFetch([{ data: [vendor('a')], nextCursor: 'stuck' }]);
    const client = new ProducerClient({ ...config, fetchImpl: impl });

    const all = await client.fetchAllVendors({ maxPages: 50 });

    // page 1 cursor=undefined → nextCursor 'stuck'; page 2 returns 'stuck' === cursor → break
    expect(all.map((v) => v.id)).toEqual(['a', 'a']);
    expect(calls).toHaveLength(2);
  });

  it('throws ProducerClientError on a non-ok response', async () => {
    const impl = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => 'Unauthorized',
      }) as unknown as Response) as unknown as typeof fetch;
    const client = new ProducerClient({ ...config, fetchImpl: impl });

    await expect(client.fetchVendorsPage()).rejects.toBeInstanceOf(ProducerClientError);
    await expect(client.fetchVendorsPage()).rejects.toMatchObject({ status: 401 });
  });
});
