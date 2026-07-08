/** Clerk webhook payload shapes + the synthetic-event guard (Campaign 1 item 3).
 *  Lives outside the route file because Next route modules may only export
 *  HTTP verbs — and the predicate deserves a unit test. */

export type ClerkEmailAddress = {
  id: string;
  email_address: string;
  verification?: { status?: string } | null;
};

export type ClerkUserCreatedEvent = {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: ClerkEmailAddress[];
    external_accounts?: unknown[] | null;
  };
};

/** Clerk's documented example-payload user id (the dashboard "send example" fixture). */
const CLERK_EXAMPLE_USER_ID = 'user_29w83sxmDNGwOuEthce5gg56FcC';

/** True for dashboard test / synthetic events that must never mint a Person.
 *  A real signup always carries at least one email address or external
 *  (OAuth) account; the dashboard fixture (John Doe, no email, fabricated id)
 *  carries neither. The documented example id is synthetic by definition. */
export function isSyntheticClerkUser(data: ClerkUserCreatedEvent['data']): boolean {
  const noIdentity = !data.email_addresses?.length && !data.external_accounts?.length;
  return noIdentity || data.id === CLERK_EXAMPLE_USER_ID;
}
