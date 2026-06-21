/** Read client for ActiveCampaign contacts — GET /api/3/contacts.
 *
 *  Pure fetch + offset pagination; does NOT persist. Disabled-by-default:
 *  {@link activeCampaignClientFromEnv} returns null until both the account API URL and
 *  token are configured (mirrors the producer/beehiiv "no-op until configured" pattern).
 *
 *  AC is account-scoped: the base URL is per-account (https://<account>.api-us1.com)
 *  and auth is the `Api-Token` header (not Bearer). */
import type { ACContact, ACContactsPage, ACList, ACListsPage } from './types';
import { isDeniedListName } from './lists';

const DEFAULT_PAGE_LIMIT = 100; // AC max per page
const DEFAULT_MAX_PAGES = 1000; // runaway guard

export class ActiveCampaignClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`ActiveCampaign contacts request failed (${status})`);
    this.name = 'ActiveCampaignClientError';
  }
}

export type ActiveCampaignClientConfig = {
  /** Account base URL, e.g. https://youraccount.api-us1.com (no trailing /api/3). */
  apiUrl: string;
  apiToken: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export type FetchContactsOptions = {
  offset?: number;
  limit?: number;
  /** When set, AC filters contacts to members of this list (GET /api/3/contacts?listid=). */
  listId?: string;
};

export type FetchListsOptions = {
  offset?: number;
  limit?: number;
};

export class ActiveCampaignClient {
  private readonly base: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ActiveCampaignClientConfig) {
    // Normalize: strip trailing slash and a trailing /api/3 if the caller included it.
    this.base = config.apiUrl.replace(/\/+$/, '').replace(/\/api\/3$/, '');
    this.apiToken = config.apiToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async fetchContactsPage(opts: FetchContactsOptions = {}): Promise<ACContactsPage> {
    const url = new URL(`${this.base}/api/3/contacts`);
    url.searchParams.set('limit', String(opts.limit ?? DEFAULT_PAGE_LIMIT));
    url.searchParams.set('offset', String(opts.offset ?? 0));
    if (opts.listId) url.searchParams.set('listid', opts.listId);

    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { 'Api-Token': this.apiToken, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new ActiveCampaignClientError(res.status, await res.text().catch(() => ''));
    }
    return (await res.json()) as ACContactsPage;
  }

  async fetchListsPage(opts: FetchListsOptions = {}): Promise<ACListsPage> {
    const url = new URL(`${this.base}/api/3/lists`);
    url.searchParams.set('limit', String(opts.limit ?? DEFAULT_PAGE_LIMIT));
    url.searchParams.set('offset', String(opts.offset ?? 0));

    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { 'Api-Token': this.apiToken, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new ActiveCampaignClientError(res.status, await res.text().catch(() => ''));
    }
    return (await res.json()) as ACListsPage;
  }

  /** Walk every list page (offset pagination), same stop conditions as fetchAllContacts. */
  async fetchAllLists(opts: { limit?: number; maxPages?: number } = {}): Promise<ACList[]> {
    const all: ACList[] = [];
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

    for (let page = 0; page < maxPages; page++) {
      const { lists, meta } = await this.fetchListsPage({ offset: page * limit, limit });
      all.push(...(lists ?? []));
      const total = meta?.total ? Number(meta.total) : undefined;
      if ((lists?.length ?? 0) < limit) break;
      if (total !== undefined && all.length >= total) break;
    }
    return all;
  }

  /** Every contact that is a member of one list (offset-paged). */
  async fetchAllContactsForList(
    listId: string,
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<ACContact[]> {
    const all: ACContact[] = [];
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

    for (let page = 0; page < maxPages; page++) {
      const { contacts, meta } = await this.fetchContactsPage({ offset: page * limit, limit, listId });
      all.push(...contacts);
      const total = meta?.total ? Number(meta.total) : undefined;
      if (contacts.length < limit) break;
      if (total !== undefined && all.length >= total) break;
    }
    return all;
  }

  /** List-scoped contact pull with the deny-by-default firewall. Resolves each requested
   *  list NAME to its AC id (case-insensitive), SKIPPING any denied name (realtors / the
   *  full database), fetches each allowed list's contacts, and unions+dedupes by contact
   *  id. Returns the pulled lists too so the caller can log exactly what was imported. */
  async fetchContactsForLists(
    listNames: readonly string[],
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<{ contacts: ACContact[]; lists: { id: string; name: string }[] }> {
    const wanted = new Set(
      listNames.filter((n) => !isDeniedListName(n)).map((n) => n.trim().toLowerCase()),
    );
    const allLists = await this.fetchAllLists(opts);
    // A list is resolved only if its name is wanted AND not denied — so a denied list that
    // also appears in AC is fenced off here regardless of what was requested.
    const resolved = allLists.filter(
      (l) => wanted.has(l.name.trim().toLowerCase()) && !isDeniedListName(l.name),
    );

    const byId = new Map<string, ACContact>();
    for (const list of resolved) {
      const contacts = await this.fetchAllContactsForList(list.id, opts);
      for (const c of contacts) byId.set(c.id, c); // dedupe across lists by contact id
    }
    return {
      contacts: [...byId.values()],
      lists: resolved.map((l) => ({ id: l.id, name: l.name })),
    };
  }

  /** Walk every page via offset pagination. Stops when a page returns fewer than the
   *  limit (last page) or the running total reaches meta.total; capped by maxPages. */
  async fetchAllContacts(
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<ACContact[]> {
    const all: ACContact[] = [];
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

    for (let page = 0; page < maxPages; page++) {
      const { contacts, meta } = await this.fetchContactsPage({ offset: page * limit, limit });
      all.push(...contacts);
      const total = meta?.total ? Number(meta.total) : undefined;
      if (contacts.length < limit) break; // short page → last page
      if (total !== undefined && all.length >= total) break;
    }
    return all;
  }
}

/** Build a client from env, or null if the connector isn't configured yet.
 *  Reads `ACTIVECAMPAIGN_API_URL` + `ACTIVECAMPAIGN_API_TOKEN`. */
export function activeCampaignClientFromEnv(fetchImpl?: typeof fetch): ActiveCampaignClient | null {
  const apiUrl = process.env.ACTIVECAMPAIGN_API_URL;
  const apiToken = process.env.ACTIVECAMPAIGN_API_TOKEN;
  if (!apiUrl || !apiToken) return null;
  return new ActiveCampaignClient({ apiUrl, apiToken, fetchImpl });
}
