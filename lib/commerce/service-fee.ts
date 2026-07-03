/** Service-fee math for PAY-node checkout (Event Builder Rebuild, Phase A).
 *
 *  Wires the previously dormant Event columns (serviceFeeMode,
 *  serviceFeePercentBps, serviceFeeFlatCents) into the amount a buyer is
 *  charged at a gate PAY step. Pure integer math - no I/O, no floats past
 *  the single rounding step per mode.
 *
 *  Modes (ServiceFeeMode enum):
 *  - absorb (default): buyer pays the flat ticket price; the operator eats
 *    Stripe's cut. total = price, fee = 0.
 *  - pass_stripe_only: buyer covers Stripe's 2.9% + 30c so the operator nets
 *    the exact ticket price. total = round((price + 30) / (1 - 0.029)),
 *    computed as round((price + 30) * 1000 / 971) - 971 is prime, so the
 *    quotient never lands on a .5 boundary and Math.round is deterministic.
 *  - pass_stripe_plus_markup: the operator nets price + markup, where
 *    markup = round(price * serviceFeePercentBps / 10000); the Stripe
 *    gross-up is applied on top of that target.
 *  - flat_per_ticket: buyer pays price + serviceFeeFlatCents; the operator
 *    still absorbs Stripe's actual cut out of that.
 *
 *  Transparency law: callers must surface these line items to the buyer -
 *  never silently inflate a single price.
 */
import type { ServiceFeeMode } from "@prisma/client";

const STRIPE_FLAT_CENTS = 30;
const NET_NUM = 971; // 1 - 2.9% as the exact rational 971/1000
const NET_DEN = 1000;

export type ServiceFeePolicy = {
  mode: ServiceFeeMode;
  percentBps: number | null;
  flatCents: number | null;
};

export type FeeLineItems = {
  /** The ticket price the operator set on the PAY node. */
  subtotalCents: number;
  /** What the buyer pays on top - shown as "Service fee". */
  serviceFeeCents: number;
  /** Promo savings; 0 unless a redemption applies. */
  discountCents: number;
  /** The amount the payment intent is minted for. */
  totalCents: number;
};

function grossUpForStripe(netTargetCents: number): number {
  return Math.round(((netTargetCents + STRIPE_FLAT_CENTS) * NET_DEN) / NET_NUM);
}

/** Compute the buyer's line items for one PAY node price under a policy. */
export function applyServiceFee(
  priceCents: number,
  policy: ServiceFeePolicy,
): FeeLineItems {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return {
      subtotalCents: priceCents,
      serviceFeeCents: 0,
      discountCents: 0,
      totalCents: priceCents,
    };
  }

  let totalCents = priceCents;
  switch (policy.mode) {
    case "pass_stripe_only":
      totalCents = grossUpForStripe(priceCents);
      break;
    case "pass_stripe_plus_markup": {
      const bps = policy.percentBps ?? 0;
      const markupCents =
        Number.isInteger(bps) && bps > 0
          ? Math.round((priceCents * bps) / 10_000)
          : 0;
      totalCents = grossUpForStripe(priceCents + markupCents);
      break;
    }
    case "flat_per_ticket": {
      const flat = policy.flatCents ?? 0;
      totalCents =
        priceCents + (Number.isInteger(flat) && flat > 0 ? flat : 0);
      break;
    }
    case "absorb":
    default:
      totalCents = priceCents;
      break;
  }

  return {
    subtotalCents: priceCents,
    serviceFeeCents: totalCents - priceCents,
    discountCents: 0,
    totalCents,
  };
}

/** Line items for a discounted PAY price (D6). The fee is computed on what
 *  the buyer actually pays - the DISCOUNTED price - never on the base. The
 *  Ticket row keeps the base price so the split reads honestly:
 *  total = base - discount + fee, exactly.
 *
 *  Callers refuse zeroing discounts before any money math (D6-2); if one
 *  slips through anyway this fails closed to the undiscounted items. */
export function applyServiceFeeWithDiscount(
  baseCents: number,
  discountCents: number,
  policy: ServiceFeePolicy,
): FeeLineItems {
  if (
    !Number.isInteger(baseCents) ||
    baseCents <= 0 ||
    !Number.isInteger(discountCents) ||
    discountCents <= 0 ||
    discountCents >= baseCents
  ) {
    return applyServiceFee(baseCents, policy);
  }
  const onDiscounted = applyServiceFee(baseCents - discountCents, policy);
  return {
    subtotalCents: baseCents,
    discountCents,
    serviceFeeCents: onDiscounted.serviceFeeCents,
    totalCents: onDiscounted.totalCents,
  };
}

/** The fee policy shape straight off an Event row (null-safe defaults). */
export function feePolicyFromEvent(event: {
  serviceFeeMode: ServiceFeeMode;
  serviceFeePercentBps: number | null;
  serviceFeeFlatCents: number | null;
}): ServiceFeePolicy {
  return {
    mode: event.serviceFeeMode,
    percentBps: event.serviceFeePercentBps,
    flatCents: event.serviceFeeFlatCents,
  };
}
