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
