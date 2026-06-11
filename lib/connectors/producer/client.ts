/** Read client for Producer's CRM export — GET /api/crm-export/vendors.
 *
 *  Pure fetch + pagination; it does NOT persist. The ingestion pipeline (added
 *  later, gated on the Contact-spine schema window) consumes what this returns.
 *  Disabled-by-default: {@link producerClientFromEnv} returns null until both the
 *  endpoint URL and the shared secret are configured (mirrors the "no-op until
 *  configured" convention of notifyProducer()/getSvix()). */
import { canonicalizeQuery, signProducerGet } from './sign';
import type { ProducerVendor, ProducerVendorsPage } from './types';

export class ProducerClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Producer CRM export request failed (${status})`);
    this.name = 'ProducerClientError';
  }
}

export type ProducerClientConfig = {
  /** Full endpoint URL, e.g. https://producer.example.com/api/crm-export/vendors.
   *  Origin + pathname are derived from it; the pathname is what gets signed. */
  endpointUrl: string;
  /** Shared HMAC secret — the same `NOBC_OS_WEBHOOK_SECRET` set on Producer. */
  secret: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock (ms epoch) for deterministic signing in tests. */
  now?: () => number;
};

export type FetchVendorsOptions = {
  /** ISO-8601 timestamp — incremental filter. */
  updatedSince?: string;
  limit?: number;
  cursor?: string;
};

export class ProducerClient {
  private readonly origin: string;
  private readonly pathname: string;
  private readonly secret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(config: ProducerClientConfig) {
    const url = new URL(config.endpointUrl);
    this.origin = url.origin;
    this.pathname = url.pathname;
    this.secret = config.secret;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  /** Fetch a single signed page of vendors. */
  async fetchVendorsPage(opts: FetchVendorsOptions = {}): Promise<ProducerVendorsPage> {
    const query = canonicalizeQuery({
      updatedSince: opts.updatedSince,
      limit: opts.limit != null ? String(opts.limit) : undefined,
      cursor: opts.cursor,
    });
    const unixSeconds = Math.floor(this.now() / 1000);
    const headers = signProducerGet({
      secret: this.secret,
      pathname: this.pathname,
      query,
      unixSeconds,
    });
    const url = `${this.origin}${this.pathname}${query ? `?${query}` : ''}`;

    const res = await this.fetchImpl(url, { method: 'GET', headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProducerClientError(res.status, body.slice(0, 500));
    }
    return (await res.json()) as ProducerVendorsPage;
  }

  /** Walk the cursor and return every vendor.
   *
   *  Defensive against a non-advancing cursor (a server bug shouldn't loop us
   *  forever) and capped by `maxPages`. */
  async fetchAllVendors(
    opts: { updatedSince?: string; limit?: number; maxPages?: number } = {},
  ): Promise<ProducerVendor[]> {
    const all: ProducerVendor[] = [];
    const maxPages = opts.maxPages ?? 1000;
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const { data, nextCursor } = await this.fetchVendorsPage({
        updatedSince: opts.updatedSince,
        limit: opts.limit,
        cursor,
      });
      all.push(...data);
      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return all;
  }
}

/** Build a client from env, or null if the connector isn't configured yet.
 *  Reads `PRODUCER_CRM_EXPORT_URL` (the full endpoint URL) + `NOBC_OS_WEBHOOK_SECRET`. */
export function producerClientFromEnv(fetchImpl?: typeof fetch): ProducerClient | null {
  const endpointUrl = process.env.PRODUCER_CRM_EXPORT_URL;
  const secret = process.env.NOBC_OS_WEBHOOK_SECRET;
  if (!endpointUrl || !secret) {
    console.warn(
      '[producer-connector] PRODUCER_CRM_EXPORT_URL/NOBC_OS_WEBHOOK_SECRET not set; connector disabled.',
    );
    return null;
  }
  return new ProducerClient({ endpointUrl, secret, fetchImpl });
}
