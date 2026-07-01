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
 *  Carry-forward: NEVER (§16.4 LOCKED - payment is per-event).
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_PAY } from "../types";

const payConfigSchema = z.object({
  priceCents: z.number().int().min(0),
  currency: z.string().min(3).max(3).default("usd"),
});
export type PayConfig = z.infer<typeof payConfigSchema>;

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
      `Get Ticket - ${formatPrice(config.priceCents, config.currency)}`,
    isPassive: false,
    carryForward: { kind: "NEVER" },
    async verify({ config, submission, member, workspaceId }) {
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
      if (intent.amount_received < config.priceCents) {
        return { outcome: "REJECTED", reason: "amount_below_price" };
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
        },
      };
    },
  };
}
