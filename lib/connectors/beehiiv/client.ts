/** Read client for beehiiv subscriptions — GET /v2/publications/{id}/subscriptions.
 *
 *  Pure fetch + cursor pagination; does NOT persist. The ingestion pipeline consumes
 *  what this returns. Disabled-by-default: {@link beehiivClientFromEnv} returns null
 *  until both the API key and publication id are configured (mirrors the "no-op until
 *  configured" convention of producerClientFromEnv()/getSvix()). */
import type { BeehiivSubscription, BeehiivSubscriptionsPage, BeehiivSubscriptionStatus } from './types';

const DEFAULT_BASE_URL = 'https://api.beehiiv.com/v2';
const DEFAULT_PAGE_LIMIT = 100; // beehiiv max
const DEFAULT_MAX_PAGES = 1000; // runaway guard

export class BeehiivClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`beehiiv subscriptions request failed (${status})`);
    this.name = 'BeehiivClientError';
  }
}

export type BeehiivClientConfig = {
  apiKey: string;
  /** Prefixed publication id, e.g. "pub_...". */
  publicationId: string;
  /** Override the API base (tests / regional hosts). Defaults to the v2 host. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export type FetchSubscriptionsOptions = {
  cursor?: string;
  limit?: number;
  /** Filter by subscription status (default: the API's `all`). */
  status?: BeehiivSubscriptionStatus;
};

export class BeehiivClient {
  private readonly apiKey: string;
  private readonly publicationId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BeehiivClientConfig) {
    this.apiKey = config.apiKey;
    this.publicationId = config.publicationId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** One page of subscriptions. Expands custom_fields + tags so names (which beehiiv
   *  has no native field for) and source tags survive into the normalized contact. */
  async fetchSubscriptionsPage(opts: FetchSubscriptionsOptions = {}): Promise<BeehiivSubscriptionsPage> {
    const url = new URL(`${this.baseUrl}/publications/${this.publicationId}/subscriptions`);
    url.searchParams.set('limit', String(opts.limit ?? DEFAULT_PAGE_LIMIT));
    url.searchParams.append('expand[]', 'custom_fields');
    url.searchParams.append('expand[]', 'tags');
    if (opts.cursor) url.searchParams.set('cursor', opts.cursor);
    if (opts.status) url.searchParams.set('status', opts.status);

    const res = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new BeehiivClientError(res.status, await res.text().catch(() => ''));
    }
    return (await res.json()) as BeehiivSubscriptionsPage;
  }

  /** Walk every page via cursor pagination. Guards against a non-advancing cursor and
   *  caps total pages so a misbehaving API can't loop forever. */
  async fetchAllSubscriptions(
    opts: { status?: BeehiivSubscriptionStatus; limit?: number; maxPages?: number } = {},
  ): Promise<BeehiivSubscription[]> {
    const all: BeehiivSubscription[] = [];
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const { data, has_more, next_cursor } = await this.fetchSubscriptionsPage({
        cursor,
        limit: opts.limit,
        status: opts.status,
      });
      all.push(...data);
      if (!has_more || !next_cursor || next_cursor === cursor) break;
      cursor = next_cursor;
    }
    return all;
  }
}

/** Build a client from env, or null if the connector isn't configured yet.
 *  Reads `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID`. */
export function beehiivClientFromEnv(fetchImpl?: typeof fetch): BeehiivClient | null {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) return null;
  return new BeehiivClient({ apiKey, publicationId, fetchImpl });
}
