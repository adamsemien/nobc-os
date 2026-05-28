'use client';
/**
 * Editorial-minimal password gate for password-protected shares.
 *
 * Submits to `POST /api/share/token/[token]/auth`. On 200 we `router.refresh()`
 * so the server component re-resolves with the freshly-set `share_auth` cookie
 * (HttpOnly, Path-scoped) and renders the gallery.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SharePasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/token/${encodeURIComponent(token)}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError('Incorrect password. Try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 w-full max-w-sm text-left">
      <label className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Password
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        autoComplete="current-password"
        className="w-full rounded-[4px] border bg-transparent px-3 py-2 text-[14px] text-[var(--apply-ink)] outline-none transition-colors focus:border-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
        style={{ borderColor: 'var(--apply-rule)' }}
        aria-invalid={error ? 'true' : 'false'}
      />
      {error ? (
        <p className="mt-2 text-[12px] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">{error}</p>
      ) : null}
      <button
        type="submit"
        disabled={!password || busy}
        className="mt-5 w-full rounded-[4px] px-4 py-2 text-[12px] uppercase tracking-[0.24em] text-white transition-colors disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
        style={{ background: 'var(--nobc-red)' }}
      >
        {busy ? 'Verifying…' : 'Enter'}
      </button>
    </form>
  );
}
