"use client";

/** Anonymous guest identify step (Stage 17, M2 guest render). Posts to the
 *  token API, then refreshes the server-rendered walkthrough so carry-forward
 *  and passive verifications land immediately. */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function IdentifyForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/gate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identify", name, email }),
      });
      if (!res.ok) {
        setError("Something went wrong - please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong - please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-text-tertiary">
          Full name
        </span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-text-tertiary">
          Email
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "One moment..." : "Continue"}
      </button>
    </form>
  );
}
