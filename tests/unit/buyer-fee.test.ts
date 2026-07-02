import { describe, it, expect } from 'vitest';
import { grossUpForBuyer, splitChargedCents } from '@/lib/ticketing/buyer-fee';

/**
 * Buyer-pays-Stripe-fee gross-up — lib/ticketing/buyer-fee.ts.
 *
 * Contract under test:
 *   - charged = round((price + 30) / (1 - 0.029)) at the named price points.
 *   - After Stripe deducts its cut (2.9% rounded to the cent + 30c), NoBC
 *     nets the ticket price within a cent — at the named points and across
 *     a full sweep.
 *   - splitChargedCents is the EXACT inverse of grossUpForBuyer for every
 *     integer price (what lets the pay step derive line items from the one
 *     charged amount it receives) — proven by sweep, not spot checks.
 *   - Free / non-positive prices pass through untouched with no fee.
 */

// Hand-checked against (price + 30) / 0.971, rounded to the nearest cent.
const TABLE = [
  { priceCents: 2500, chargedCents: 2606, feeCents: 106 }, // $25.00 -> $26.06 (No Bad Saturday)
  { priceCents: 1700, chargedCents: 1782, feeCents: 82 }, // $17.00 -> $17.82
  { priceCents: 1050, chargedCents: 1112, feeCents: 62 }, // $10.50 -> $11.12
  { priceCents: 9999, chargedCents: 10329, feeCents: 330 }, // $99.99 -> $103.29
];

/** What Stripe deducts from a card charge: 2.9% rounded to the cent + 30c. */
const stripeCut = (chargedCents: number) => Math.round(chargedCents * 0.029) + 30;

describe('grossUpForBuyer', () => {
  it.each(TABLE)(
    'charges $priceCents + fee $feeCents = $chargedCents',
    ({ priceCents, chargedCents, feeCents }) => {
      expect(grossUpForBuyer(priceCents)).toEqual({
        baseCents: priceCents,
        feeCents,
        chargedCents,
      });
    },
  );

  it.each(TABLE)(
    'nets the ticket price within a cent after the Stripe cut ($priceCents)',
    ({ priceCents, chargedCents }) => {
      const net = chargedCents - stripeCut(chargedCents);
      expect(Math.abs(net - priceCents)).toBeLessThanOrEqual(1);
    },
  );

  it('passes free and non-positive prices through with no fee', () => {
    expect(grossUpForBuyer(0)).toEqual({ baseCents: 0, feeCents: 0, chargedCents: 0 });
    expect(grossUpForBuyer(-500)).toEqual({ baseCents: -500, feeCents: 0, chargedCents: -500 });
  });
});

describe('splitChargedCents inverts grossUpForBuyer exactly', () => {
  it('round-trips every price from 1c to $3,000.00 and nets within a cent', () => {
    for (let priceCents = 1; priceCents <= 300_000; priceCents++) {
      const gross = grossUpForBuyer(priceCents);
      // Exact inverse: the display derives the same split the server charged.
      const split = splitChargedCents(gross.chargedCents);
      if (split.baseCents !== priceCents || split.feeCents !== gross.feeCents) {
        // Only construct the expect on failure — keeps the 300k sweep fast.
        expect(split).toEqual({
          baseCents: priceCents,
          feeCents: gross.feeCents,
          chargedCents: gross.chargedCents,
        });
      }
      // The fee is always a real, positive pass-through on a paid price.
      if (gross.feeCents <= 0) expect(gross.feeCents).toBeGreaterThan(0);
      // And the buyer's total always nets the ticket price within a cent.
      const net = gross.chargedCents - stripeCut(gross.chargedCents);
      if (Math.abs(net - priceCents) > 1) {
        expect(Math.abs(net - priceCents)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('passes non-positive totals through with no fee', () => {
    expect(splitChargedCents(0)).toEqual({ baseCents: 0, feeCents: 0, chargedCents: 0 });
  });
});
