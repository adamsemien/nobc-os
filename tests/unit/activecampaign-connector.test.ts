import { describe, it, expect, afterEach } from 'vitest';
import {
  ActiveCampaignClient,
  ActiveCampaignClientError,
  activeCampaignClientFromEnv,
} from '@/lib/connectors/activecampaign/client';
import { contactToNormalizedContact } from '@/lib/connectors/activecampaign/transform';
import type { ACContact, ACContactsPage } from '@/lib/connectors/activecampaign/types';

const fetchedAt = new Date('2026-06-11T12:00:00.000Z');

function contact(p: Partial<ACContact>): ACContact {
  return { id: p.id ?? '1', email: p.email ?? 'a@b.com', ...p };
}

describe('contactToNormalizedContact', () => {
  it('maps native AC fields and tags the role as subscriber', () => {
    const c = contactToNormalizedContact(
      contact({ id: '68', email: '  Jane@Example.com ', firstName: 'Jane', lastName: 'Doe', phone: '3120000000' }),
      fetchedAt,
    );
    expect(c.source).toBe('activecampaign');
    expect(c.externalId).toBe('68');
    expect(c.email).toBe('jane@example.com');
    expect(c.emailRaw).toBe('Jane@Example.com');
    expect(c.firstName).toBe('Jane');
    expect(c.lastName).toBe('Doe');
    expect(c.phone).toBe('3120000000');
    expect(c.roleHint).toBe('subscriber');
  });

  it('treats AC placeholder values ("", "0", "0000-00-00") as absent', () => {
    const c = contactToNormalizedContact(
      contact({ firstName: '', lastName: '0', phone: '', cdate: '0000-00-00 00:00:00' }),
    );
    expect(c.firstName).toBeUndefined();
    expect(c.lastName).toBeUndefined();
    expect(c.phone).toBeUndefined();
    expect(c.enrichment?.createdAt).toBeUndefined();
  });
});

function fakeFetch(pages: ACContactsPage[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let i = 0;
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers as Record<string, string>) ?? {} });
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const client = (fetchImpl: typeof fetch) =>
  new ActiveCampaignClient({ apiUrl: 'https://acct.api-us1.com', apiToken: 'tok_1', fetchImpl });

describe('ActiveCampaignClient', () => {
  it('builds /api/3/contacts with limit+offset and sends the Api-Token header', async () => {
    const { impl, calls } = fakeFetch([{ contacts: [] }]);
    await client(impl).fetchContactsPage({ offset: 200, limit: 100 });
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe('/api/3/contacts');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(u.searchParams.get('offset')).toBe('200');
    expect((calls[0].headers as Record<string, string>)['Api-Token']).toBe('tok_1');
  });

  it('strips a trailing /api/3 from the configured base URL', async () => {
    const { impl, calls } = fakeFetch([{ contacts: [] }]);
    const c = new ActiveCampaignClient({ apiUrl: 'https://acct.api-us1.com/api/3/', apiToken: 't', fetchImpl: impl });
    await c.fetchContactsPage();
    expect(new URL(calls[0].url).pathname).toBe('/api/3/contacts');
  });

  it('throws ActiveCampaignClientError on a non-OK response', async () => {
    const impl = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(client(impl).fetchContactsPage()).rejects.toBeInstanceOf(ActiveCampaignClientError);
  });

  it('paginates by offset and stops on a short page', async () => {
    const full = Array.from({ length: 100 }, (_, i) => contact({ id: String(i) }));
    const { impl, calls } = fakeFetch([
      { contacts: full, meta: { total: '150' } },
      { contacts: [contact({ id: '100' })], meta: { total: '150' } }, // short page → stop
    ]);
    const all = await client(impl).fetchAllContacts({ limit: 100 });
    expect(all).toHaveLength(101);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1].url).searchParams.get('offset')).toBe('100');
  });

  it('stops when the running total reaches meta.total even on a full final page', async () => {
    const page = Array.from({ length: 2 }, (_, i) => contact({ id: String(i) }));
    const { impl, calls } = fakeFetch([{ contacts: page, meta: { total: '2' } }]);
    const all = await client(impl).fetchAllContacts({ limit: 2 });
    expect(all).toHaveLength(2);
    expect(calls).toHaveLength(1); // total reached → no second request
  });
});

describe('activeCampaignClientFromEnv', () => {
  const saved = { url: process.env.ACTIVECAMPAIGN_API_URL, tok: process.env.ACTIVECAMPAIGN_API_TOKEN };
  afterEach(() => {
    process.env.ACTIVECAMPAIGN_API_URL = saved.url;
    process.env.ACTIVECAMPAIGN_API_TOKEN = saved.tok;
  });

  it('returns null when env is unset (disabled by default)', () => {
    delete process.env.ACTIVECAMPAIGN_API_URL;
    delete process.env.ACTIVECAMPAIGN_API_TOKEN;
    expect(activeCampaignClientFromEnv()).toBeNull();
  });

  it('returns a client when both env vars are set', () => {
    process.env.ACTIVECAMPAIGN_API_URL = 'https://x.api-us1.com';
    process.env.ACTIVECAMPAIGN_API_TOKEN = 'tok';
    expect(activeCampaignClientFromEnv()).toBeInstanceOf(ActiveCampaignClient);
  });
});
