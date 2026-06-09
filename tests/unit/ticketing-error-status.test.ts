import { describe, it, expect } from 'vitest';
import { ticketingErrorStatus } from '@/lib/ticketing/tiers';

// The only pure unit in the ticketing money surface: the error-code -> HTTP
// status map that every ticket-tier route relies on. Pinning it keeps the
// "has_sales -> 409" / "cross_workspace -> 404" contract stable.
describe('ticketingErrorStatus', () => {
  it('maps not_found and cross_workspace to 404', () => {
    expect(ticketingErrorStatus('not_found')).toBe(404);
    expect(ticketingErrorStatus('cross_workspace')).toBe(404);
  });
  it('maps has_sales (a tier with sales cannot be destructively changed) to 409', () => {
    expect(ticketingErrorStatus('has_sales')).toBe(409);
  });
  it('maps validation failures to 422', () => {
    expect(ticketingErrorStatus('invalid_scope')).toBe(422);
    expect(ticketingErrorStatus('invalid_quantity')).toBe(422);
  });
});
