import { describe, it, expect } from 'vitest';
import { ActiveCampaignClient } from '@/lib/connectors/activecampaign/client';
import {
  ALLOWED_AC_LISTS,
  isDeniedListName,
  allowedListNames,
} from '@/lib/connectors/activecampaign/lists';
import type { ACContact, ACList } from '@/lib/connectors/activecampaign/types';

// ── pure firewall predicates ────────────────────────────────────────────────────────
describe('AC list firewall (pure)', () => {
  it('denies realtor + entire-database names, case-insensitively', () => {
    expect(isDeniedListName('Realtors')).toBe(true);
    expect(isDeniedListName('  realtors ')).toBe(true);
    expect(isDeniedListName('Realtor Partners')).toBe(true); // realtor-namespaced
    expect(isDeniedListName('Entire Database')).toBe(true);
    expect(isDeniedListName('entire database')).toBe(true);
  });

  it('allows the three relationship lists', () => {
    expect(isDeniedListName('Network')).toBe(false);
    expect(isDeniedListName('Industry Partner')).toBe(false);
    expect(isDeniedListName('Sphere')).toBe(false);
  });

  it('allowedListNames strips denied entries even if injected into the allowlist', () => {
    expect(allowedListNames([...ALLOWED_AC_LISTS, 'Realtors', 'Entire Database'])).toEqual([
      'Network',
      'Industry Partner',
      'Sphere',
    ]);
  });
});

// ── fetchContactsForLists (mocked fetch) ────────────────────────────────────────────
function jsonRes(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Mock AC: GET /api/3/lists returns `lists`; GET /api/3/contacts?listid=ID returns that
 *  list's contacts. Single short page each (length < default 100 → pagination stops). */
function mockFetch(lists: ACList[], contactsByListId: Record<string, ACContact[]>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const offset = Number(url.searchParams.get('offset') ?? '0');
    if (url.pathname.endsWith('/api/3/lists')) {
      return jsonRes(offset === 0 ? { lists, meta: { total: String(lists.length) } } : { lists: [] });
    }
    if (url.pathname.endsWith('/api/3/contacts')) {
      const listId = url.searchParams.get('listid') ?? '';
      const rows = contactsByListId[listId] ?? [];
      return jsonRes(offset === 0 ? { contacts: rows, meta: { total: String(rows.length) } } : { contacts: [] });
    }
    throw new Error(`unexpected AC url: ${url.toString()}`);
  }) as unknown as typeof fetch;
}

const c = (id: string): ACContact => ({ id, email: `${id}@x.com` });

function client(fetchImpl: typeof fetch): ActiveCampaignClient {
  return new ActiveCampaignClient({ apiUrl: 'https://acct.api-us1.com', apiToken: 't', fetchImpl });
}

describe('fetchContactsForLists (firewalled, list-scoped)', () => {
  const lists: ACList[] = [
    { id: '1', name: 'Network' },
    { id: '2', name: 'Industry Partner' },
    { id: '3', name: 'Sphere' },
    { id: '4', name: 'Realtors' },
    { id: '5', name: 'Entire Database' },
  ];

  it('resolves only the allowlisted lists and never the realtor / database lists', async () => {
    const contactsByListId = {
      '1': [c('a')],
      '2': [c('b')],
      '3': [c('d')],
      '4': [c('realtor1')],
      '5': [c('everyone1')],
    };
    const res = await client(mockFetch(lists, contactsByListId)).fetchContactsForLists(ALLOWED_AC_LISTS);
    expect(res.lists.map((l) => l.name).sort()).toEqual(['Industry Partner', 'Network', 'Sphere']);
    const ids = res.contacts.map((x) => x.id).sort();
    expect(ids).toEqual(['a', 'b', 'd']);
    expect(ids).not.toContain('realtor1');
    expect(ids).not.toContain('everyone1');
  });

  it('excludes a denied list even when explicitly requested', async () => {
    const contactsByListId = { '1': [c('a')], '4': [c('realtor1')] };
    const res = await client(mockFetch(lists, contactsByListId)).fetchContactsForLists(['Network', 'Realtors']);
    expect(res.lists.map((l) => l.name)).toEqual(['Network']);
    expect(res.contacts.map((x) => x.id)).toEqual(['a']);
  });

  it('dedupes a contact that belongs to more than one allowed list', async () => {
    const contactsByListId = { '1': [c('a'), c('shared')], '3': [c('shared'), c('z')] };
    const res = await client(mockFetch(lists, contactsByListId)).fetchContactsForLists(['Network', 'Sphere']);
    expect(res.contacts.map((x) => x.id).sort()).toEqual(['a', 'shared', 'z']); // 'shared' once
  });
});
