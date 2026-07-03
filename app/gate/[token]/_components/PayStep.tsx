"use client";

/** In-page PAY step (Stage 17, M4-PAY - greenlit 2026-07-02, auto-capture).
 *
 *  Collapsed: one button carrying the engine's own prompt copy
 *  ("Get Ticket - $X"). Click -> mint an intent server-side -> render the
 *  Payment Element inline. Confirm charges immediately (auto-capture), then
 *  the existing public submit action verifies the intent server-side and the
 *  proof lands. The browser never sees amounts, ids, or any config - only a
 *  client secret scoped to its own intent.
 *
 *  Element colors are read from the design tokens at runtime (no hex
 *  literals in this file - the values come from the theme variables).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Appearance } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

type LineItems = {
  subtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
};

function formatCents(cents: number): string {
  const dollars = (cents / 100).toFixed(2).replace(/\.00$/, "");
  return `$${dollars}`;
}

/** Ticket / Discount / Service fee / Total - full price upfront, never a
 *  silently inflated single number (Decision 3 transparency law). The
 *  Discount row appears only when a code applied (D6). */
function LineItemRows({ items }: { items: LineItems }) {
  return (
    <div className="mb-3 flex flex-col gap-1 border-b border-border pb-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">Ticket</span>
        <span className="text-text-primary">{formatCents(items.subtotalCents)}</span>
      </div>
      {items.discountCents > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Discount</span>
          <span className="text-text-primary">-{formatCents(items.discountCents)}</span>
        </div>
      ) : null}
      {items.serviceFeeCents > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Service fee</span>
          <span className="text-text-primary">{formatCents(items.serviceFeeCents)}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between font-medium">
        <span className="text-text-primary">Total</span>
        <span className="text-text-primary">{formatCents(items.totalCents)}</span>
      </div>
    </div>
  );
}

/** Quiet code entry: collapsed to a text link, expands to one field. The
 *  server classifies the code (D6-1): comp codes redeem through the existing
 *  zero-Stripe action, discount codes re-mint the intent at the discounted
 *  amount. All pricing and validation is server-side - failure shows one
 *  guest-safe line. */
function CodeEntry({
  token,
  nodeId,
  onNotice,
  onMinted,
}: {
  token: string;
  nodeId: string;
  onNotice: (message: string) => void;
  onMinted: (minted: { clientSecret: string; lineItems: LineItems | null }) => void;
}) {
  const router = useRouter();
  const [openEntry, setOpenEntry] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function redeemComp(trimmed: string) {
    const res = await fetch(`/api/gate/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem_comp", nodeId, code: trimmed }),
    });
    const body = (await res.json()) as {
      available?: boolean;
      notice?: string;
    };
    if (!res.ok || !body.available) {
      onNotice(GENERIC_ERROR);
      return;
    }
    if (body.notice) {
      onNotice(body.notice);
      return;
    }
    router.refresh();
  }

  async function redeem() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setRedeeming(true);
    onNotice("");
    try {
      const res = await fetch(`/api/gate/${token}/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, promoCode: trimmed }),
      });
      const body = (await res.json()) as {
        clientSecret?: string;
        lineItems?: LineItems;
        compCode?: boolean;
        alreadyPaid?: boolean;
        error?: string;
      };
      if (body.alreadyPaid) {
        router.refresh();
        return;
      }
      if (body.compCode) {
        await redeemComp(trimmed);
        return;
      }
      if (!res.ok || !body.clientSecret) {
        onNotice(body.error ?? GENERIC_ERROR);
        return;
      }
      onMinted({
        clientSecret: body.clientSecret,
        lineItems: body.lineItems ?? null,
      });
    } catch {
      onNotice(GENERIC_ERROR);
    } finally {
      setRedeeming(false);
    }
  }

  if (!openEntry) {
    return (
      <button
        type="button"
        onClick={() => setOpenEntry(true)}
        className="mt-2 self-start text-xs text-text-secondary underline underline-offset-2 transition-opacity hover:opacity-80"
      >
        Have a code?
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        className="w-40 rounded-sm border border-border bg-raised px-2 py-1.5 text-xs text-text-primary outline-none focus:border-primary"
        maxLength={80}
      />
      <button
        type="button"
        onClick={redeem}
        disabled={redeeming || code.trim().length === 0}
        className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {redeeming ? "One moment…" : "Apply"}
      </button>
    </div>
  );
}

function tokenAppearance(): Appearance {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string) => styles.getPropertyValue(name).trim();
  return {
    theme: "stripe",
    variables: {
      colorPrimary: read("--primary") || undefined,
      colorText: read("--text-primary") || undefined,
      colorBackground: read("--card") || undefined,
      borderRadius: "4px",
    },
  };
}

function CheckoutForm({
  token,
  nodeId,
  onNotice,
}: {
  token: string;
  nodeId: string;
  onNotice: (message: string) => void;
}) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    onNotice("");
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (result.error) {
        // Stripe's own messages are written for cardholders - guest-safe.
        onNotice(result.error.message ?? GENERIC_ERROR);
        return;
      }
      const intent = result.paymentIntent;
      if (!intent || intent.status !== "succeeded") {
        onNotice("The payment did not go through. Try again in a moment.");
        return;
      }
      const res = await fetch(`/api/gate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          nodeId,
          submission: { paymentIntentId: intent.id },
        }),
      });
      if (!res.ok) {
        onNotice("Your payment went through but the step did not update. Refresh this page.");
        return;
      }
      router.refresh();
    } catch {
      onNotice(GENERIC_ERROR);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PaymentElement />
      <button
        type="button"
        onClick={pay}
        disabled={paying || !stripe || !elements}
        className="self-start rounded-sm bg-primary px-4 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {paying ? "Processing…" : "Pay now"}
      </button>
    </div>
  );
}

export function PayStep({
  token,
  nodeId,
  prompt,
}: {
  token: string;
  nodeId: string;
  prompt: string;
}) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItems | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");

  async function start() {
    setStarting(true);
    setNotice("");
    try {
      const res = await fetch(`/api/gate/${token}/payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      const body = (await res.json()) as {
        clientSecret?: string;
        lineItems?: LineItems;
        alreadyPaid?: boolean;
        error?: string;
      };
      if (body.alreadyPaid) {
        router.refresh();
        return;
      }
      if (!res.ok || !body.clientSecret) {
        setNotice(body.error ?? GENERIC_ERROR);
        return;
      }
      setAppearance(tokenAppearance());
      setLineItems(body.lineItems ?? null);
      setClientSecret(body.clientSecret);
    } catch {
      setNotice(GENERIC_ERROR);
    } finally {
      setStarting(false);
    }
  }

  function handleMinted(minted: {
    clientSecret: string;
    lineItems: LineItems | null;
  }) {
    setAppearance((current) => current ?? tokenAppearance());
    setLineItems(minted.lineItems);
    setClientSecret(minted.clientSecret);
  }

  return (
    <div className="mt-2">
      {clientSecret ? (
        <div className="rounded-sm border border-border bg-raised p-4">
          {lineItems ? <LineItemRows items={lineItems} /> : null}
          {/* Keyed on the secret: applying a code re-mints, and the Payment
              Element must remount onto the fresh intent. */}
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{ clientSecret, appearance: appearance ?? undefined }}
          >
            <CheckoutForm token={token} nodeId={nodeId} onNotice={setNotice} />
          </Elements>
          {lineItems && lineItems.discountCents > 0 ? null : (
            <CodeEntry
              token={token}
              nodeId={nodeId}
              onNotice={setNotice}
              onMinted={handleMinted}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="inline-flex items-center self-start rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {starting ? "One moment…" : prompt}
          </button>
          <CodeEntry
            token={token}
            nodeId={nodeId}
            onNotice={setNotice}
            onMinted={handleMinted}
          />
        </div>
      )}
      {notice ? (
        <p className="mt-2 text-xs leading-snug text-text-secondary">{notice}</p>
      ) : null}
    </div>
  );
}
