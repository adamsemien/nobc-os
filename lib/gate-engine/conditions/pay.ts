/** PAY condition (Tier 1 / STRIPE_PAYMENT).
 *
 *  Verifies a Stripe payment_intent SUCCEEDED for config.priceCents. READS
 *  payment state only - it never creates, captures, or modifies a charge and
 *  never touches the frozen payment routes. Stripe access goes through an
 *  injectable reader port (production default: the lib/stripe.ts singleton)
 *  so tests run without network.
 *
 *  Replay defense: the intent must be traceable to THIS member - either
 *  intent.metadata.memberId matches, or an internal RSVP/Ticket row ties the
 *  intent to the member inside this workspace. Without this, any guest could
 *  satisfy PAY with someone else's intent id.
 *
 *  Discounts (D6): the mint route stamps a server-computed discount into the
 *  intent metadata. The verifier honors that stamp ONLY when it names this
 *  exact node + workspace and its integers reconcile (base - discount =
 *  discounted, 0 < discounted < configured price); then the amount defense is
 *  amount_received >= discountedCents. Any other intent - no stamp, foreign
 *  node, malformed stamp - keeps the full-price defense unchanged, so a
 *  discounted intent minted for a cheap node can never satisfy a dearer one.
 *
 *  Carry-forward: NEVER (§16.4 LOCKED - payment is per-event).
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_PAY } from "../types";

const payConfigSchema = z.object({
  priceCents: z.number().int().min(0),
  currency: z.string().min(3).max(3).default("usd"),
  /** Optional guest-facing label ("Early Bird", "GA", "Door"). */
  label: z.string().min(1).max(80).optional(),
  /** Availability window (ISO datetimes). Outside it the node is not offered
   *  - enforced at the offer/mint layer, never inside the evaluator. */
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  /** Cap on successful purchases against THIS node (Early Bird runs out). */
  maxQuantity: z.number().int().min(1).optional(),
});
export type PayConfig = z.infer<typeof payConfigSchema>;

export type PayAvailability =
  | { available: true }
  | { available: false; reason: "not_yet" | "closed" | "sold_out" };

/** Offer-layer availability for a PAY node. Pure - callers supply the sold
 *  count (successful proofs/orders against the node) and the clock. Used by
 *  the guest-view offer filter and the mint route's server-side enforcement;
 *  the M1 verifier is deliberately not involved. */
export function payNodeAvailability(
  config: Pick<PayConfig, "availableFrom" | "availableUntil" | "maxQuantity">,
  state: { now: Date; soldCount: number },
): PayAvailability {
  if (config.availableFrom && new Date(config.availableFrom).getTime() > state.now.getTime()) {
    return { available: false, reason: "not_yet" };
  }
  if (config.availableUntil && new Date(config.availableUntil).getTime() <= state.now.getTime()) {
    return { available: false, reason: "closed" };
  }
  if (config.maxQuantity !== undefined && state.soldCount >= config.maxQuantity) {
    return { available: false, reason: "sold_out" };
  }
  return { available: true };
}

const paySubmissionSchema = z.object({
  paymentIntentId: z.string().min(1),
});

export type StripeIntentSnapshot = {
  id: string;
  status: string;
  amount_received: number;
  currency: string;
  metadata?: Record<string, string>;
};

export type StripeIntentReader = (
  paymentIntentId: string
) => Promise<StripeIntentSnapshot | null>;

export type IntentOwnershipCheck = (args: {
  workspaceId: string;
  memberId: string;
  paymentIntentId: string;
}) => Promise<boolean>;

async function defaultReadIntent(paymentIntentId: string): Promise<StripeIntentSnapshot | null> {
  const { stripe } = await import("@/lib/stripe");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (!intent) return null;
  return {
    id: intent.id,
    status: intent.status,
    amount_received: intent.amount_received,
    currency: intent.currency,
    metadata: intent.metadata as Record<string, string>,
  };
}

async function defaultOwnsIntent(args: {
  workspaceId: string;
  memberId: string;
  paymentIntentId: string;
}): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const rsvp = await db.rSVP.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      stripePaymentIntentId: args.paymentIntentId,
    },
    select: { id: true },
  });
  if (rsvp) return true;
  const ticket = await db.ticket.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      stripePaymentIntentId: args.paymentIntentId,
    },
    select: { id: true },
  });
  return ticket !== null;
}

function formatPrice(priceCents: number, currency: string): string {
  const amount = (priceCents / 100).toFixed(2);
  return currency.toLowerCase() === "usd"
    ? `$${amount}`
    : `${amount} ${currency.toUpperCase()}`;
}

export type DiscountStamp = {
  promoCodeId: string;
  promoCode: string | null;
  baseCents: number;
  discountCents: number;
  discountedCents: number;
};

/** Read the mint route's discount stamp off intent metadata - null unless it
 *  binds to exactly this node + workspace and every integer reconciles. A
 *  null here is never an error: the caller falls back to the full-price
 *  defense (fail-closed toward charging more, never less). */
export function readDiscountStamp(
  metadata: Record<string, string> | undefined,
  bind: { nodeId: string; workspaceId: string; priceCents: number },
): DiscountStamp | null {
  if (!metadata) return null;
  if (metadata.kind !== "gate-pay") return null;
  if (!metadata.promoCodeId) return null;
  if (metadata.nodeId !== bind.nodeId) return null;
  if (metadata.workspaceId !== bind.workspaceId) return null;
  const baseCents = Number.parseInt(metadata.baseCents ?? "", 10);
  const discountCents = Number.parseInt(metadata.discountCents ?? "", 10);
  const discountedCents = Number.parseInt(metadata.discountedCents ?? "", 10);
  if (
    !Number.isInteger(baseCents) ||
    !Number.isInteger(discountCents) ||
    !Number.isInteger(discountedCents)
  ) {
    return null;
  }
  if (discountCents <= 0 || discountedCents <= 0) return null;
  if (baseCents - discountCents !== discountedCents) return null;
  if (discountedCents >= bind.priceCents) return null;
  return {
    promoCodeId: metadata.promoCodeId,
    promoCode: metadata.promoCode ?? null,
    baseCents,
    discountCents,
    discountedCents,
  };
}

export function createPayCondition(ports?: {
  readIntent?: StripeIntentReader;
  ownsIntent?: IntentOwnershipCheck;
}): ConditionTypeDef<PayConfig> {
  const readIntent = ports?.readIntent ?? defaultReadIntent;
  const ownsIntent = ports?.ownsIntent ?? defaultOwnsIntent;

  return {
    type: CONDITION_PAY,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "STRIPE_PAYMENT",
    configSchema: payConfigSchema,
    guestPrompt: (config) =>
      config.label
        ? `${config.label} - ${formatPrice(config.priceCents, config.currency)}`
        : `Get Ticket - ${formatPrice(config.priceCents, config.currency)}`,
    isPassive: false,
    carryForward: { kind: "NEVER" },
    async verify({ config, submission, member, workspaceId, nodeId }) {
      const parsed = paySubmissionSchema.safeParse(submission);
      if (!parsed.success) {
        return { outcome: "REJECTED", reason: "missing_payment_intent" };
      }
      const intent = await readIntent(parsed.data.paymentIntentId);
      if (!intent) {
        return { outcome: "REJECTED", reason: "intent_not_found" };
      }
      if (intent.status !== "succeeded") {
        return { outcome: "REJECTED", reason: "intent_not_succeeded" };
      }
      if (intent.currency.toLowerCase() !== config.currency.toLowerCase()) {
        return { outcome: "REJECTED", reason: "currency_mismatch" };
      }
      // D6: a node-bound server stamp lowers the required amount to the
      // discounted price; anything else keeps the full-price defense.
      const stamp = readDiscountStamp(intent.metadata, {
        nodeId,
        workspaceId,
        priceCents: config.priceCents,
      });
      const requiredCents = stamp ? stamp.discountedCents : config.priceCents;
      if (intent.amount_received < requiredCents) {
        return {
          outcome: "REJECTED",
          reason: stamp ? "amount_below_discounted_price" : "amount_below_price",
        };
      }
      const ownedByMetadata = intent.metadata?.memberId === member.id;
      const owned =
        ownedByMetadata ||
        (await ownsIntent({
          workspaceId,
          memberId: member.id,
          paymentIntentId: intent.id,
        }));
      if (!owned) {
        return { outcome: "REJECTED", reason: "intent_not_owned_by_member" };
      }
      return {
        outcome: "SATISFIED",
        payload: {
          paymentIntentId: intent.id,
          amountReceived: intent.amount_received,
          currency: intent.currency,
          // The promo facts the commerce bridge records (D6-9). Stamped from
          // the server-validated mint metadata, never from the submission.
          ...(stamp
            ? {
                promoCodeId: stamp.promoCodeId,
                ...(stamp.promoCode ? { promoCode: stamp.promoCode } : {}),
                baseCents: stamp.baseCents,
                discountCents: stamp.discountCents,
              }
            : {}),
        },
      };
    },
  };
}
