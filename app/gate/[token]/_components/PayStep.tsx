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
      setClientSecret(body.clientSecret);
    } catch {
      setNotice(GENERIC_ERROR);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-2">
      {clientSecret ? (
        <div className="rounded-sm border border-border bg-raised p-4">
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: appearance ?? undefined }}
          >
            <CheckoutForm token={token} nodeId={nodeId} onNotice={setNotice} />
          </Elements>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="inline-flex items-center rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {starting ? "One moment…" : prompt}
        </button>
      )}
      {notice ? (
        <p className="mt-2 text-xs leading-snug text-text-secondary">{notice}</p>
      ) : null}
    </div>
  );
}
