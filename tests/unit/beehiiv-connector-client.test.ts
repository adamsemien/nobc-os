import { describe, it, expect, afterEach } from 'vitest';
import { BeehiivClient, BeehiivClientError, beehiivClientFromEnv } from '@/lib/connectors/beehiiv/client';
import type { BeehiivSubscriptionsPage } from '@/lib/connectors/beehiiv/types';

/** Build a fake fetch that returns queued JSON pages and records the URLs/headers. */
function fakeFetch(pages: BeehiivSubscriptionsPage[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers as Record<string, string>) ?? {} });
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function client(fetchImpl: typeof fetch, baseUrl = 'https://api.beehiiv.test/v2') {
  return new BeehiivClient({ apiKey: 'key_123', publicationId: 'pub_abc', baseUrl, fetchImpl });
}

describe('BeehiivClient.fetchSubscriptionsPage', () => {
  it('builds the URL (limit + expand[] + cursor + status) and sends the Bearer key', async () => {
    const { impl, calls } = fakeFetch([{ data: [], has_more: false }]);
    await client(impl).fetchSubscriptionsPage({ cursor: 'CUR', limit: 50, status: 'active' });

    const u = new URL(calls[0].url);
    expect(u.pathname).toBe('/v2/publications/pub_abc/subscriptions');
    expect(u.searchParams.get('limit')).toBe('50');
    expect(u.searchParams.getAll('expand[]')).toEqual(['custom_fields', 'tags']);
    expect(u.searchParams.get('cursor')).toBe('CUR');
    expect(u.searchParams.get('status')).toBe('active');
    expect((calls[0].headers as Record<string, string>).Authorization).toBe('Bearer key_123');
  });

  it('throws BeehiivClientError on a non-OK response', async () => {
    const impl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    await expect(client(impl).fetchSubscriptionsPage()).rejects.toBeInstanceOf(BeehiivClientError);
  });
});

describe('BeehiivClient.fetchAllSubscriptions', () => {
  it('walks cursor pages and stops when has_more is false', async () => {
    const { impl, calls } = fakeFetch([
      { data: [{ id: 's1', email: 'a@x.com', status: 'active' }], has_more: true, next_cursor: 'c2' },
      { data: [{ id: 's2', email: 'b@x.com', status: 'active' }], has_more: false, next_cursor: null },
    ]);
    const all = await client(impl).fetchAllSubscriptions();
    expect(all.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(new URL(calls[1].url).searchParams.get('cursor')).toBe('c2');
  });

  it('stops on a non-advancing cursor (guards an infinite loop)', async () => {
    const { impl, calls } = fakeFetch([
      { data: [{ id: 's1', email: 'a@x.com', status: 'active' }], has_more: true, next_cursor: 'same' },
      { data: [{ id: 's1', email: 'a@x.com', status: 'active' }], has_more: true, next_cursor: 'same' },
    ]);
    const all = await client(impl).fetchAllSubscriptions();
    // page0 (no cursor) → cursor 'same'; page1 (cursor 'same') returns 'same' again → stop.
    expect(calls).toHaveLength(2);
    expect(all).toHaveLength(2);
  });

  it('respects maxPages', async () => {
    const { impl, calls } = fakeFetch([
      { data: [{ id: 's1', email: 'a@x.com', status: 'active' }], has_more: true, next_cursor: 'c2' },
      { data: [{ id: 's2', email: 'b@x.com', status: 'active' }], has_more: true, next_cursor: 'c3' },
      { data: [{ id: 's3', email: 'c@x.com', status: 'active' }], has_more: true, next_cursor: 'c4' },
    ]);
    await client(impl).fetchAllSubscriptions({ maxPages: 2 });
    expect(calls).toHaveLength(2);
  });
});

describe('beehiivClientFromEnv', () => {
  const saved = { key: process.env.BEEHIIV_API_KEY, pub: process.env.BEEHIIV_PUBLICATION_ID };
  afterEach(() => {
    process.env.BEEHIIV_API_KEY = saved.key;
    process.env.BEEHIIV_PUBLICATION_ID = saved.pub;
  });

  it('returns null when env is unset (disabled by default)', () => {
    delete process.env.BEEHIIV_API_KEY;
    delete process.env.BEEHIIV_PUBLICATION_ID;
    expect(beehiivClientFromEnv()).toBeNull();
  });

  it('returns a client when both env vars are set', () => {
    process.env.BEEHIIV_API_KEY = 'k';
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_x';
    expect(beehiivClientFromEnv()).toBeInstanceOf(BeehiivClient);
  });
});
