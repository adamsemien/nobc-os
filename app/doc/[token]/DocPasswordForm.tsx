'use client';
/**
 * Password gate for a magic-link recap/brief. Submits to POST /api/doc/[token]/auth; on 200
 * refreshes so the server component re-resolves with the freshly-set share_auth cookie.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DocPasswordForm({ token }: { token: string }) {
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
      const res = await fetch(`/api/doc/${encodeURIComponent(token)}/auth`, {
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
        disabled={busy}
        className="mt-5 w-full rounded-[4px] bg-[var(--nobc-red)] px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-opacity disabled:opacity-50 font-[family-name:var(--font-dm-sans)]"
      >
        {busy ? 'Checking…' : 'Unlock recap'}
      </button>
    </form>
  );
}
