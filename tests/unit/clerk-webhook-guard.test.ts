import { describe, it, expect } from 'vitest';
import { isSyntheticClerkUser } from '@/lib/clerk-webhook';

// Synthetic Clerk webhook guard (Campaign 1 item 3): dashboard test events
// (John Doe, no email, fabricated user id) must never mint a Person.

function user(over: Record<string, unknown> = {}) {
  return {
    id: 'user_real123',
    first_name: 'Ada',
    last_name: 'Lovelace',
    primary_email_address_id: 'idn_1',
    email_addresses: [
      { id: 'idn_1', email_address: 'ada@example.com', verification: { status: 'verified' } },
    ],
    external_accounts: [],
    ...over,
  };
}

describe('isSyntheticClerkUser', () => {
  it('skips the dashboard fixture: no emails AND no external accounts', () => {
    expect(
      isSyntheticClerkUser(user({ email_addresses: [], external_accounts: [] })),
    ).toBe(true);
  });

  it('skips when both identity arrays are absent entirely', () => {
    expect(
      isSyntheticClerkUser(user({ email_addresses: undefined, external_accounts: undefined })),
    ).toBe(true);
  });

  it("skips Clerk's documented example user id even when it carries an email", () => {
    expect(isSyntheticClerkUser(user({ id: 'user_29w83sxmDNGwOuEthce5gg56FcC' }))).toBe(true);
  });

  it('passes a real signup with an email address', () => {
    expect(isSyntheticClerkUser(user())).toBe(false);
  });

  it('passes an OAuth-only signup: no email yet, but an external account', () => {
    expect(
      isSyntheticClerkUser(user({ email_addresses: [], external_accounts: [{ id: 'eac_1' }] })),
    ).toBe(false);
  });
});
