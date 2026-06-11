/** Wire types for the beehiiv v2 API — the subset the connector reads.
 *  GET https://api.beehiiv.com/v2/publications/{publicationId}/subscriptions
 *  See https://developers.beehiiv.com/api-reference/subscriptions/index */

/** A custom field value on a subscription (returned only with expand[]=custom_fields).
 *  beehiiv has no native name fields — first/last name, if collected, live here. */
export type BeehiivCustomField = {
  name: string;
  value?: string | number | boolean | null;
};

export type BeehiivSubscriptionStatus =
  | 'validating'
  | 'invalid'
  | 'pending'
  | 'active'
  | 'inactive'
  | 'needs_attention'
  | 'paused';

export type BeehiivSubscription = {
  /** Prefixed id, e.g. "sub_...". */
  id: string;
  email: string;
  status: BeehiivSubscriptionStatus;
  /** Unix epoch seconds. */
  created?: number;
  subscription_tier?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_channel?: string;
  utm_campaign?: string;
  referring_site?: string;
  /** Returned only with expand[]=tags. */
  tags?: string[];
  /** Returned only with expand[]=custom_fields. */
  custom_fields?: BeehiivCustomField[];
};

/** Cursor-paginated list response. `has_more` + `next_cursor` drive the walk
 *  (offset `page`/`total_pages` are deprecated and ignored here). */
export type BeehiivSubscriptionsPage = {
  data: BeehiivSubscription[];
  limit?: number;
  has_more?: boolean;
  next_cursor?: string | null;
};
