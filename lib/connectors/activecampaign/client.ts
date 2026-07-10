/** Read client for ActiveCampaign contacts — GET /api/3/contacts.
 *
 *  Pure fetch + offset pagination; does NOT persist. Disabled-by-default:
 *  {@link activeCampaignClientFromEnv} returns null until both the account API URL and
 *  token are configured (mirrors the producer/beehiiv "no-op until configured" pattern).
 *
 *  AC is account-scoped: the base URL is per-account (https://<account>.api-us1.com)
 *  and auth is the `Api-Token` header (not Bearer). */
import type { ACContact, ACContactsPage } from './types';

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
  /** AC list-scoped filter — GET /api/3/contacts?listid=<id>. */
  listid?: string;
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
    if (opts.listid) url.searchParams.set('listid', opts.listid);

    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { 'Api-Token': this.apiToken, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new ActiveCampaignClientError(res.status, await res.text().catch(() => ''));
    }
    return (await res.json()) as ACContactsPage;
  }

  /** Walk every page via offset pagination. Stops when a page returns fewer than the
   *  limit (last page) or the running total reaches meta.total; capped by maxPages.
   *
   *  NOT used by the ActiveCampaign import route (Slice 2 Phase 1) — this pulls the
   *  entire account unscoped, which includes the Realtors list and its ~40
   *  namespaced tags (see NoBadOS__spec__activecampaign-import-and-suppression-corrected__2026-06-18.md
   *  §3). The import route uses fetchContactsForLists() instead; this stays for any
   *  future caller that genuinely wants an unscoped pull. */
  async fetchAllContacts(
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<ACContact[]> {
    return this.walkPages({}, opts);
  }

  /** One AC list, offset-paged to completion. `GET /api/3/contacts?listid=<id>` — AC's
   *  documented list-scoped contacts filter. */
  async fetchContactsByList(
    listId: string,
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<ACContact[]> {
    return this.walkPages({ listid: listId }, opts);
  }

  /** The realtor firewall for Slice 2 Phase 1: an explicit allowlist of AC list ids,
   *  fetched individually and unioned + deduped by contact id. No unscoped fallback —
   *  a list this doesn't know about is simply never pulled. */
  async fetchContactsForLists(
    listIds: string[],
    opts: { limit?: number; maxPages?: number } = {},
  ): Promise<ACContact[]> {
    const byId = new Map<string, ACContact>();
    for (const listId of listIds) {
      const contacts = await this.fetchContactsByList(listId, opts);
      for (const c of contacts) byId.set(c.id, c);
    }
    return [...byId.values()];
  }

  private async walkPages(
    extraParams: { listid?: string },
    opts: { limit?: number; maxPages?: number },
  ): Promise<ACContact[]> {
    const all: ACContact[] = [];
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

    for (let page = 0; page < maxPages; page++) {
      const { contacts, meta } = await this.fetchContactsPage({ offset: page * limit, limit, ...extraParams });
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

export type ActiveCampaignImportListIds = {
  network: string;
  industryPartner: string;
  sphere: string;
};

/** The Slice 2 Phase 1 realtor firewall config — the NoBC-slice allowlist (Network /
 *  Industry Partner / Sphere lists, per the AC-suppression spec §3). Reads
 *  `ACTIVECAMPAIGN_LIST_ID_NETWORK` / `ACTIVECAMPAIGN_LIST_ID_INDUSTRY_PARTNER` /
 *  `ACTIVECAMPAIGN_LIST_ID_SPHERE`. Returns null unless ALL THREE are set — there is
 *  deliberately no partial-allowlist or unscoped fallback; the import route no-ops
 *  (400) rather than guessing which lists are safe. */
export function activeCampaignImportListIdsFromEnv(): ActiveCampaignImportListIds | null {
  const network = process.env.ACTIVECAMPAIGN_LIST_ID_NETWORK;
  const industryPartner = process.env.ACTIVECAMPAIGN_LIST_ID_INDUSTRY_PARTNER;
  const sphere = process.env.ACTIVECAMPAIGN_LIST_ID_SPHERE;
  if (!network || !industryPartner || !sphere) return null;
  return { network, industryPartner, sphere };
}
