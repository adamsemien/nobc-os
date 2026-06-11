/** HMAC request signing for Producer's CRM export.
 *
 *  Mirrors the exact recipe Producer's server enforces (its `crm-export-auth.ts`,
 *  same family as the Phase J webhook in lib/producer-webhook.ts). Getting the
 *  canonicalization byte-for-byte right matters: ISO timestamps in `updatedSince`
 *  contain ':' which URLSearchParams percent-encodes — signing the un-encoded form
 *  would 401 every timestamped request. */
import { createHmac } from 'crypto';

export type ProducerSignatureHeaders = {
  'X-NoBC-Timestamp': string;
  'X-NoBC-Signature': string;
};

/** Build the canonical query string Producer signs: params sorted by key, then
 *  re-serialized with URLSearchParams (which percent-encodes special characters).
 *  Undefined/empty values are dropped so they neither sign nor send. */
export function canonicalizeQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined && value !== '') usp.append(key, value);
  }
  return usp.toString();
}

/** Sign a GET request to Producer's CRM export.
 *
 *  message = `${unixSeconds}.GET.${pathname}${query ? "?" + query : ""}`
 *  signature = HMAC-SHA256(secret, message) → hex
 *
 *  `query` must already be canonicalized via {@link canonicalizeQuery}. The server
 *  enforces a ±300s replay window against `X-NoBC-Timestamp`. */
export function signProducerGet(args: {
  secret: string;
  pathname: string;
  query: string;
  unixSeconds: number;
}): ProducerSignatureHeaders {
  const { secret, pathname, query, unixSeconds } = args;
  const message = `${unixSeconds}.GET.${pathname}${query ? `?${query}` : ''}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return {
    'X-NoBC-Timestamp': String(unixSeconds),
    'X-NoBC-Signature': `hmac-sha256=${hex}`,
  };
}
